import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('Smoke E2E: fluxos completos no servidor real com gateway simulado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crednex-smoke-'))
  process.env.CREDNEX_DATA_FILE = path.join(dir, 'db.json')
  process.env.CREDNEX_ADMIN_PASSWORD = 'Smoke-Test-Password-2026'
  process.env.CREDNEX_NO_LISTEN = '1'
  process.env.CRON_SECRET = 'c'.repeat(40)
  process.env.PIXPAY_API_KEY = 'test-key'
  process.env.PIXPAY_API_SECRET = 'test-secret'
  process.env.PIXPAY_WEBHOOK_TOKEN = 't'.repeat(40)
  process.env.APP_PUBLIC_URL = 'https://crednex.smoke'
  process.env.PIXPAY_BASE_URL = 'https://gateway.smoke'
  const {app} = await import('../server/index.ts')
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(r => server.once('listening', r))
  const port = (server.address() as {port: number}).port
  const base = `http://127.0.0.1:${port}/api`
  const nativeFetch = globalThis.fetch
  let pixCounter = 0
  const gateways: Array<{id: string}> = []
  globalThis.fetch = (async (input: any, init: any) => {
    if (String(input).startsWith('https://gateway.smoke')) {
      const created = {id: `pix-smoke-${++pixCounter}`, qrCode: '000201-SMOKE', paymentUrl: null, status: 'PENDING'}
      gateways.push(created)
      return new Response(JSON.stringify({data: created}), {status: 200, headers: {'Content-Type': 'application/json'}})
    }
    return nativeFetch(input, init)
  }) as typeof fetch
  const call = async (url: string, body?: unknown, token?: string, method?: string) => {
    const res = await nativeFetch(base + url, {
      method: method || (body ? 'POST' : 'GET'),
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}),
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
    return {status: res.status, body: parsed}
  }
  try {
    assert.equal((await call('/health')).status, 200)
    const spa = await nativeFetch(`http://127.0.0.1:${port}/`)
    assert.ok(spa.status === 200 && (spa.headers.get('content-type') || '').includes('text/html'))
    const login = await call('/auth/login', {username: 'admin', password: process.env.CREDNEX_ADMIN_PASSWORD})
    assert.equal(login.status, 200)
    const adminToken = login.body.token
    const pub = await call('/public')
    assert.equal(pub.body.plans.length, 9)
    const rules = {...pub.body.rules, confirmed: true, returnPrincipal: true, prizes: [{label: 'R$ 10,00', cents: 1000, weight: 1}, {label: 'Sem prêmio', cents: 0, weight: 9}]}
    assert.equal((await call('/admin/rules', rules, adminToken, 'PATCH')).status, 200)
    // Cadastro sob convite do admin e depois sob convite de participante
    assert.equal((await call('/auth/register', {name: 'Maria Silva', username: 'maria', email: 'maria@smoke.local', password: 'Password-smoke-2026'})).status, 200)
    const maria = (await call('/auth/login', {username: 'maria', password: 'Password-smoke-2026'})).body
    const mariaState = (await call('/state', undefined, maria.token)).body
    assert.equal((await call('/auth/register', {name: 'Pedro Santos', username: 'pedro', email: 'pedro@smoke.local', password: 'Password-smoke-2026', inviteCode: mariaState.user.inviteCode})).status, 200)
    const pedro = (await call('/auth/login', {username: 'pedro', password: 'Password-smoke-2026'})).body
    // Depósito PIX + webhook
    const depMaria = await call('/deposits', {amount: 100, document: '123.456.789-01'}, maria.token)
    assert.equal(depMaria.status, 200)
    assert.equal(depMaria.body.status, 'PENDING')
    const webhookUrl = `/webhooks/2pp?token=${process.env.PIXPAY_WEBHOOK_TOKEN}`
    assert.equal((await call(webhookUrl, {status: 'success', data: {transactionId: gateways[0].id, amount: '100.00', status: 'COMPLETED', paymentMethod: 'pix'}})).status, 200)
    assert.equal((await call('/state', undefined, maria.token)).body.balances.deposit, 10000)
    // Ativação: maria elegível antes do pedro → comissão nível 1; a indicação já liberou o giro
    await call('/deposits', {amount: 500, document: '987.654.321-00'}, pedro.token)
    await call(webhookUrl, {transactionId: gateways[1].id, amount: '500.00', status: 'COMPLETED'})
    assert.equal((await call('/contracts', {planId: 'C-1', amount: 25, wallet: 'deposit'}, maria.token)).body.status, 'ACTIVE')
    assert.equal((await call('/contracts', {planId: 'C-2', amount: 500, wallet: 'deposit'}, pedro.token)).body.status, 'ACTIVE')
    const mariaAfter = (await call('/state', undefined, maria.token)).body
    const commission = mariaAfter.ledger.find((e: any) => e.key.includes(':level:1'))
    assert.ok(commission && commission.cents === 5000, 'comissão nível 1 de R$50,00')
    assert.equal(mariaAfter.spins.filter((s: any) => s.status === 'AVAILABLE').length, 1)
    assert.equal((await call('/spins/draw', {}, maria.token)).status, 200)
    // Credcofre: não participa da roleta e o resgate libera o capital em Rendimentos
    const vaultA = await call('/contracts', {planId: 'CREDCOFRE', amount: 25, wallet: 'deposit'}, maria.token)
    assert.equal(vaultA.status, 200)
    assert.equal((await call('/state', undefined, maria.token)).body.spins.filter((s: any) => s.status === 'AVAILABLE').length, 0)
    assert.equal((await call('/spins/draw', {}, maria.token)).status, 422)
    assert.equal((await call('/vault/redeem', {contractId: vaultA.body.id}, maria.token)).status, 200)
    // Reinvestimento com saldo de RENDIMENTOS liberado: 1 giro por operação elegível
    assert.equal((await call('/contracts', {planId: 'C-1', amount: 25, wallet: 'earnings'}, maria.token)).status, 200)
    assert.equal((await call('/state', undefined, maria.token)).body.spins.filter((s: any) => s.status === 'AVAILABLE').length, 1)
    const spin = await call('/spins/draw', {}, maria.token)
    assert.equal(spin.status, 200)
    assert.ok(spin.body.prize && spin.body.status === 'USED')
    assert.equal((await call('/spins/draw', {}, maria.token)).status, 422)
    // Capital no Credcofre não é sacável: o saque vem do saldo liberado
    const wd = await call('/withdrawals', {wallet: 'vault', amount: 25, pixKey: 'maria@smoke.local'}, maria.token)
    assert.equal(wd.status, 422, 'o capital no Credcofre não é sacável direto')
    assert.match(wd.body.error, /Somente as Carteiras/)
    // Suporte: abertura e encerramento administrativo
    const ticket = (await call('/tickets', {subject: 'Dúvida sobre rendimento', message: 'Quando cai?'}, maria.token)).body
    const reply = await call(`/tickets/${ticket.id}/reply`, {message: 'Em até 24h úteis.', close: true}, adminToken)
    assert.equal(reply.body.status, 'CLOSED')
    // Cron com segredo
    assert.equal((await call('/cron/accrue')).status, 401)
    const cronOk = await nativeFetch(`${base}/cron/accrue`, {headers: {Authorization: `Bearer ${process.env.CRON_SECRET}`}})
    assert.equal(cronOk.status, 200)
    assert.equal((await call('/admin/process', {}, adminToken)).status, 200)
    // Aprovação e crédito administrativo: autorização, repetição e webhook tardio.
    const pending = (await call('/deposits', {amount: 40, document: '12345678901'}, maria.token)).body
    const approval = `/admin/deposits/${pending.id}/approve`
    const balanceUrl = `/admin/users/${maria.user.id}/balance`
    const initialBalance = (await call('/state', undefined, maria.token)).body.balances.deposit
    assert.equal((await call(approval, {reference: 'Conferência PIX'}, maria.token)).status, 403)
    assert.equal((await call(balanceUrl, {amount: 10}, maria.token)).status, 403)
    assert.equal((await call(approval, {reference: 'Conferência PIX'})).status, 401)
    assert.equal((await call(approval, {reference: ''}, adminToken)).status, 422)
    const approvals = await Promise.all([1,2].map(() => call(approval, {reference: 'Comprovante conferido'}, adminToken)))
    assert.ok(approvals.every(r => r.status === 200))
    assert.equal(approvals.filter(r => r.body.credited).length, 1)
    assert.equal((await call(webhookUrl, {transactionId: pending.providerId, amount: '40.00', status: 'COMPLETED'})).body.credited, false)
    const creditBody = {amount: '12.34', reason: 'Ajuste de saldo conferido', requestId: 'test-credit-request-001'}
    const credits = await Promise.all([1,2].map(() => call(balanceUrl, creditBody, adminToken)))
    assert.ok(credits.every(r => r.status === 200))
    assert.equal(credits.filter(r => r.body.credited).length, 1)
    assert.equal((await call(balanceUrl, {...creditBody, amount: 99}, adminToken)).status, 422)
    assert.equal((await call(balanceUrl, {...creditBody, amount: -1, requestId: 'invalid-credit-request'}, adminToken)).status, 422)
    assert.equal((await call('/state', undefined, maria.token)).body.balances.deposit, initialBalance + 5234)
    const adminState = (await call('/admin/state', undefined, adminToken)).body
    assert.equal(adminState.audit.filter((a: any) => a.action === 'PIX_MANUALLY_APPROVED').length, 1)
    assert.equal(adminState.audit.filter((a: any) => a.action === 'BALANCE_ADDED').length, 1)
    // Troca de senha invalida todas as sessões
    assert.equal((await call('/profile', {currentPassword: 'errada', newPassword: 'Nova-senha-2026-nova'}, maria.token, 'PATCH')).status, 422)
    assert.equal((await call('/profile', {currentPassword: 'Password-smoke-2026', newPassword: 'Nova-senha-2026-nova'}, maria.token, 'PATCH')).status, 200)
    assert.equal((await call('/state', undefined, maria.token)).status, 401)
    assert.equal((await call('/auth/login', {username: 'maria', password: 'Nova-senha-2026-nova'})).status, 200)
    // Bloqueio administrativo
    assert.equal((await call(`/admin/users/${pedro.user.id}`, {status: 'BLOCKED'}, adminToken, 'PATCH')).status, 200)
    assert.equal((await call('/state', undefined, pedro.token)).status, 401)
    // Persistência em arquivo com o estado completo
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'))
    assert.equal(raw.users.length, 3)
    assert.ok(raw.ledger.length > 6)
    assert.equal(raw.rules.confirmed, true)
  } finally {
    globalThis.fetch = nativeFetch
    await new Promise<void>((r, j) => server.close(e => (e ? j(e) : r())))
    fs.rmSync(dir, {recursive: true, force: true})
  }
})
