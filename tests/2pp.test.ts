import test from 'node:test'
import assert from 'node:assert/strict'
import {pixPayConfig,createPixPayTransaction} from '../server/pixpay.js'

test('2PP: endpoint e contrato da documentação oficial',async()=>{
  const names=['PIXPAY_API_KEY','PIXPAY_API_SECRET','PIXPAY_WEBHOOK_TOKEN','APP_PUBLIC_URL','PIXPAY_BASE_URL']
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]])), original=globalThis.fetch
  try {
    process.env.PIXPAY_API_KEY='test-key';process.env.PIXPAY_API_SECRET='test-secret'
    process.env.PIXPAY_WEBHOOK_TOKEN='x'.repeat(40);process.env.APP_PUBLIC_URL='https://crednex.example';delete process.env.PIXPAY_BASE_URL
    const config=pixPayConfig()
    assert.equal(config.baseUrl,'https://webhookxxx.2pp.online')
    assert.equal(new URL(config.webhookUrl).pathname,'/api/webhooks/2pp')
    globalThis.fetch=(async(url:any,init:any)=>{
      assert.equal(url,'https://webhookxxx.2pp.online/api/v1/transactions/pix')
      assert.equal(init.headers['X-API-Key'],'test-key');assert.equal(init.headers['X-API-Secret'],'test-secret')
      const body=JSON.parse(init.body);assert.equal(body.amount,40);assert.equal(body.customerDocument,'12345678901');assert.equal(body.webhookUrl,config.webhookUrl)
      return new Response(JSON.stringify({data:{transactionId:'test-id',qrCode:'000201-test',paymentUrl:null,status:'PENDING'}}),{status:200})
    }) as typeof fetch
    const payment=await createPixPayTransaction({amount:40,customerName:'Teste',customerEmail:'teste@example.test',customerDocument:'123.456.789-01'})
    assert.equal(payment.id,'test-id');assert.equal(payment.qrCode,'000201-test')
    process.env.PIXPAY_BASE_URL='http://insecure.example';assert.throws(()=>pixPayConfig(),/HTTPS/)
    process.env.PIXPAY_BASE_URL='https://user:secret@example.test';assert.throws(()=>pixPayConfig(),/HTTPS/)
  } finally {globalThis.fetch=original;for(const n of names){if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n]}}
})
