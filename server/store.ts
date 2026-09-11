import {initialPlans} from '../src/catalog.js'
import fs from 'node:fs'
import path from 'node:path'
import {neon} from '@neondatabase/serverless'
import {emptyDb,migrateWalletPolicy,migrateLockedYieldPolicy,migrateCyclePlans,type Db} from './engine.js'
import {validDocument} from './pixpay-withdrawals.js'

// Serialized local transactions; PostgreSQL uses optimistic concurrency across instances.
// Every write is retried automatically when another instance commits first, so routine
// concurrent traffic does not fail user operations.
const MAX_PG_ATTEMPTS = 3

type Row = {payload: unknown; version: number}
export type Query = {parts: string[]; values: unknown[]}
export type Executor = (query: Query) => Promise<Row[]>

const tag = (strings: TemplateStringsArray | string[], ...values: unknown[]): Query => ({parts: [...strings], values})

const SQL_CREATE = tag`CREATE TABLE IF NOT EXISTS crednex_state (id text PRIMARY KEY, payload jsonb NOT NULL, version bigint NOT NULL DEFAULT 1)`
const SQL_SELECT = tag`SELECT payload, version FROM crednex_state WHERE id = 'main'`
const SQL_INSERT = tag`INSERT INTO crednex_state (id, payload) VALUES ('main', $1::jsonb) ON CONFLICT DO NOTHING`
const SQL_UPDATE = tag`UPDATE crednex_state SET payload = $1::jsonb, version = version + 1 WHERE id = 'main' AND version = $2 RETURNING version`

// Normalizes a stored payload: some drivers return jsonb already parsed, others return text.
function parsePayload(value: unknown): Db {
  // Deep round-trip so nested arrays/objects are never shared with the stored row:
  // a retry after an optimistic conflict must re-read pristine state.
  const parsed = typeof value === 'string' ? JSON.parse(value) : JSON.parse(JSON.stringify(value ?? null))
  const base = emptyDb()
  // Forward compatibility: fields added in newer releases get safe defaults when missing.
  const normalized={...base, ...parsed, plans:parsed?.plans??initialPlans(), walletPolicyVersion:parsed?.walletPolicyVersion??0, rules: {...base.rules, ...(parsed?.rules ?? {}), activePlanLimits: {...base.rules.activePlanLimits, ...(parsed?.rules?.activePlanLimits ?? {})}}}
  for(const user of normalized.users){
    if(!user.cpf&&typeof user.pixKey==='string'){
      const candidate=user.pixKey.replace(/\D/g,'')
      if(candidate.length===11&&validDocument(candidate))user.cpf=candidate
    }
  }
  return normalized
}

export function createStore(seed: () => Db, options?: {databaseUrl?: string; executor?: Executor}) {
  const file = path.resolve(process.env.CREDNEX_DATA_FILE || '.data/crednex.json')
  const url = options?.databaseUrl ?? process.env.DATABASE_URL
  if (process.env.VERCEL && !url) throw new Error('DATABASE_URL é obrigatória na Vercel')
  if (url && !options?.executor) {
    const client = neon(url) // a single cached client per process
    options = {...options, executor: (query) => client.query(query.parts.join(''), query.values) as unknown as Promise<Row[]>}
  }
  const executor = options?.executor
  let queue: Promise<unknown> = Promise.resolve()
  let bootstrapped = false

  async function bootstrap(): Promise<void> {
    if (bootstrapped || !executor) return
    await executor(SQL_CREATE)
    const rows = await executor(SQL_SELECT)
    if (!rows.length) {
      await executor({...SQL_INSERT, values: [JSON.stringify(seed())]})
    }
    bootstrapped = true
  }

  function loadFile(): {db: Db; corrupt?: string} {
    if (!fs.existsSync(file)) return {db: seed()}
    const raw = fs.readFileSync(file, 'utf8')
    try {
      return {db: parsePayload(JSON.parse(raw))}
    } catch (error) {
      // A damaged financial ledger must never be replaced with a zero-balance seed.
      const backup = `${file}.corrupt-${Date.now()}`
      try { fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL) } catch { /* original stays untouched */ }
      console.error(`Banco local corrompido; recuperação necessária: ${backup}`)
      throw Object.assign(new Error('Dados financeiros indisponíveis; restauração administrativa necessária'), {status:503,cause:error})
    }
  }

  function saveFile(db: Db): void {
    fs.mkdirSync(path.dirname(file), {recursive: true})
    const temp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(temp, JSON.stringify(db))
    fs.renameSync(temp, file)
  }

  async function transaction<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
    const task = queue.then(async () => {
      if (executor) {
        await bootstrap()
        let lastError: Error | undefined
        for (let attempt = 1; attempt <= MAX_PG_ATTEMPTS; attempt++) {
          const rows = await executor(SQL_SELECT)
          const db = parsePayload(rows[0]?.payload ?? seed())
          const version = rows[0]?.version ?? 0
          const before = JSON.stringify(db)
          if(!db.plans)db.plans=initialPlans()
          for(const c of db.contracts){const p=initialPlans().find(p=>p.id===c.planId)??db.plans.find(p=>p.id===c.planId);c.family??=p?.family;c.planName??=p?.name}
          migrateWalletPolicy(db)
          migrateLockedYieldPolicy(db)
          migrateCyclePlans(db)
          const result = await fn(db)
          const after = JSON.stringify(db)
          if (before === after) return result // no mutation: nothing to persist
          const updated = await executor({...SQL_UPDATE, values: [after, version]})
          if (updated.length) return result
          // Another instance committed between our read and write: re-read and re-run.
          lastError = new Error('Operação concorrente: atualize e tente novamente')
        }
        throw lastError ?? new Error('Falha ao persistir a operação')
      }
      const loaded = loadFile()
      const db = loaded.db
      const before = JSON.stringify(db)
      if(!db.plans)db.plans=initialPlans()
      for(const c of db.contracts){const p=initialPlans().find(p=>p.id===c.planId)??db.plans.find(p=>p.id===c.planId);c.family??=p?.family;c.planName??=p?.name}
      migrateWalletPolicy(db)
      migrateLockedYieldPolicy(db)
      migrateCyclePlans(db)
      const result = await fn(db)
      const after = JSON.stringify(db)
      if (before !== after || loaded.corrupt || !fs.existsSync(file)) saveFile(db)
      return result
    })
    queue = task.catch(() => {})
    return task
  }
  return {transaction}
}
