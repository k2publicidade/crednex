import test from 'node:test'
import assert from 'node:assert/strict'
import {createPixPayWithdrawal,validatePayout} from '../server/pixpay-withdrawals.js'

test('saída PIX segue contrato 2PP, transmite centavos corretamente e não repete timeout',async()=>{
  const names=['PIXPAY_API_KEY','PIXPAY_API_SECRET','PIXPAY_WEBHOOK_TOKEN','APP_PUBLIC_URL','PIXPAY_BASE_URL']
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]])),original=globalThis.fetch
  const input={withdrawalId:'local-test',amountCents:3600,pixKey:'test@example.test',pixKeyType:'email' as const,customerDocument:'52998224725'}
  try {
    Object.assign(process.env,{PIXPAY_API_KEY:'test',PIXPAY_API_SECRET:'test',PIXPAY_WEBHOOK_TOKEN:'x'.repeat(40),APP_PUBLIC_URL:'https://example.test',PIXPAY_BASE_URL:'https://webhookxxx.2pp.online'})
    let calls=0
    globalThis.fetch=(async(url,init)=>{
      calls++
      assert.equal(String(url),'https://webhookxxx.2pp.online/api/v1/withdrawals/pix')
      const body=JSON.parse(String(init?.body))
      assert.equal(body.amount,36)
      assert.equal(body.pixKeyType,'email')
      assert.equal(new URL(body.webhookUrl).searchParams.get('withdrawalId'),'local-test')
      return new Response(JSON.stringify({status:'success',data:{transactionId:'provider-test',amount:'36.00',netAmount:'33.00',status:'PENDING'}}))
    }) as typeof fetch
    assert.equal((await createPixPayWithdrawal(input)).status,'PENDING')
    assert.equal(calls,1)
    globalThis.fetch=(async()=>{calls++;throw new Error('timeout')}) as typeof fetch
    await assert.rejects(createPixPayWithdrawal(input),/timeout/)
    assert.equal(calls,2)
    assert.throws(()=>validatePayout({...input,pixKeyType:'cpf'}),/Chave PIX/)
  } finally {
    globalThis.fetch=original
    for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n]}
  }
})
