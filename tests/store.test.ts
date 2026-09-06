import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createStore,type Query,type Row} from '../server/store.js'
import {emptyDb,audit,type Db} from '../server/engine.js'

const dbUrl='postgres://fake:test@example.test/crednex'

// In-memory fake of the single crednex_state table, emulating Neon's HTTP driver:
// rows come back directly (no wrapper) and jsonb may arrive parsed or as text.
function fakePg(initial?: {payload: string | Db; version: number}) {
  let row: Row = initial ? {payload: initial.payload, version: initial.version} : {payload: emptyDb(), version: 1}
  let tableCreated = false
  const log: string[] = []
  const executor = async (query: Query): Promise<Row[]> => {
    const text = query.parts.join('\u0001')
    log.push(text.slice(0, 24))
    if (text.startsWith('CREATE TABLE')) { tableCreated = true; return [] }
    if (text.startsWith('SELECT payload')) return [{payload: row.payload, version: row.version}]
    if (text.startsWith('INSERT INTO crednex_state')) {
      if (!row) row = {payload: JSON.parse(String(query.values[0])), version: 1}
      return []
    }
    if (text.startsWith('UPDATE crednex_state')) {
      const payload = String(query.values[0]), expected = Number(query.values[1])
      if (row && row.version === expected) {
        row = {payload: JSON.parse(payload), version: row.version + 1}
        return [{payload: row.payload, version: row.version}]
      }
      return []
    }
    throw new Error(`Query inesperada: ${text}`)
  }
  return {executor, tableCreated: () => tableCreated, state: () => row, log}
}

test('banco: seed automático, versão otimista e persistência no PostgreSQL', async () => {
  const fake = fakePg()
  const store = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: fake.executor})
  await store.transaction(db => { audit(db, 'seed', 'BOOT', {}) })
  await store.transaction(db => { audit(db, 'a', 'ACT', {}) })
  const state = fake.state() as {payload: Db; version: number}
  assert.equal(state.version, 3)
  assert.equal(state.payload.audit.length, 2)
  assert.equal(state.payload.audit[0].action, 'BOOT')
  assert.equal(state.payload.audit[1].action, 'ACT')
})

test('banco: payload jsonb em texto também é normalizado', async () => {
  const db = emptyDb(); audit(db, 'x', 'OLD', {})
  const fake = fakePg({payload: JSON.stringify(db), version: 3})
  const store = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: fake.executor})
  await store.transaction(d => { audit(d, 'y', 'NEW', {}) })
  const state = fake.state() as {payload: Db; version: number}
  assert.equal(state.version, 4)
  assert.equal(state.payload.audit.length, 2)
})

test('banco: conflito concorrente é repetido automaticamente sobre o estado novo', async () => {
  const fake = fakePg()
  const store = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: fake.executor})
  let writes = 0
  const original = fake.executor
  const conflicting = async (query: Query): Promise<Row[]> => {
    const text = query.parts.join('\u0001')
    if (text.startsWith('UPDATE crednex_state') && writes === 0) {
      writes++
      // Outra instância confirma primeiro: versão avança e o payload muda.
      const current = fake.state() as {payload: Db; version: number}
      const merged: Db = {...current.payload, users: [...current.payload.users, {id: 'ghost'}] as never}
      fake.state().payload = merged
      fake.state().version = current.version + 1
      return [] // o UPDATE não encontrou a versão esperada
    }
    return original(query)
  }
  const store2 = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: conflicting})
  let runs = 0
  await store2.transaction(db => { runs++; db.users.push({id: 'real'} as never) })
  const state = fake.state() as {payload: Db; version: number}
  assert.equal(runs, 2, 'a função deve rodar de novo após o conflito')
  assert.equal(state.payload.users.length, 2) // ghost + real, sem perda
  assert.ok(state.version >= 3)
})

test('banco: conflito permanente falha após tentativas sem persistir parcial', async () => {
  const fake = fakePg()
  const store = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: fake.executor})
  let attempts = 0
  const blocking = async (query: Query): Promise<Row[]> => {
    const text = query.parts.join('\u0001')
    if (text.startsWith('UPDATE crednex_state')) return [] // nunca vence
    return fake.executor(query)
  }
  const store2 = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: blocking})
  await assert.rejects(
    store2.transaction(db => { attempts++; db.users.push({id: 'x'} as never) }),
    /Operação concorrente/
  )
  assert.equal(attempts, 3)
  const state = fake.state() as {payload: Db; version: number}
  assert.equal(state.payload.users.length, 0, 'nada parcial pode ser persistido')
})

test('banco: estado antigo sem campos novos ganha defaults sem perder dados', async () => {
  const old: Partial<Db> = {version: 1, users: [{id: 'u', username: 'ana'} as never], rules: {confirmed: true} as never, ledger: [], contracts: [], deposits: [], withdrawals: [], tickets: [], spins: [], audit: [], sessions: {}, salaryMonths: undefined}
  const fake = fakePg({payload: JSON.stringify(old), version: 9})
  const store = createStore(() => emptyDb(), {databaseUrl: dbUrl, executor: fake.executor})
  await store.transaction(db => { audit(db, 'u', 'MIGRATED', {}) })
  const state = fake.state() as {payload: Db; version: number}
  assert.equal(state.payload.users[0].username, 'ana')
  assert.ok(Array.isArray(state.payload.spins))
  assert.ok(Array.isArray(state.payload.salaryMonths))
  assert.equal(state.payload.rules.depositMin, 4000, 'defaults de regras preservam configuração existente')
  assert.equal(state.payload.rules.confirmed, true)
  assert.equal(state.payload.rules.activePlanLimits['C-1'], 2)
})

test('banco: arquivo corrompido bloqueia operações sem zerar saldos', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crednex-store-'))
  const file = path.join(dir, 'db.json')
  const previous = process.env.CREDNEX_DATA_FILE
  process.env.CREDNEX_DATA_FILE = file
  try {
    fs.writeFileSync(file, '{not valid json')
    const store = createStore(() => emptyDb())
    await assert.rejects(store.transaction(db => { audit(db, 'a', 'OK', {}) }), /restauração administrativa/)
    const backups = fs.readdirSync(dir).filter(f => f.includes('.corrupt-'))
    assert.equal(backups.length, 1, 'cópia do arquivo quebrado preservada')
    assert.equal(fs.readFileSync(file, 'utf8'), '{not valid json')
  } finally {
    if (previous === undefined) delete process.env.CREDNEX_DATA_FILE
    else process.env.CREDNEX_DATA_FILE = previous
    fs.rmSync(dir, {recursive: true, force: true})
  }
})
