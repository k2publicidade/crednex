import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,balance} from '../server/engine.js'
import {confirmDeposit,attachPayment,reviewStaleDeposits} from '../server/payments.js'
const event=(id='remote-1',amount='40.00')=>({status:'success',data:{transactionId:id,amount,status:'COMPLETED',paymentMethod:'pix'}})
function fixture(wallet?:string){const db=emptyDb();db.deposits.push({id:'local-1',userId:'user-1',cents:4000,status:'CREATING',at:new Date().toISOString(),...(wallet?{wallet}:{})});return db}
test('callback anterior à resposta cria um crédito e a resposta mantém PAID',()=>{const db=fixture();confirmDeposit(db,event(),'local-1');attachPayment(db,'local-1',{id:'remote-1',qrCode:'pix',status:'PENDING',paymentUrl:null});assert.equal(db.deposits[0].status,'PAID');assert.equal(balance(db,'user-1','deposit'),4000);assert.equal(db.deposits[0].qrCode,'pix')})
test('webhooks repetidos não duplicam crédito nem auditoria',()=>{const db=fixture();confirmDeposit(db,event(),'local-1');assert.equal(confirmDeposit(db,event()).credited,false);assert.equal(db.audit.length,1);assert.equal(db.ledger.length,1)})
test('rejeita referência cruzada e transação associada a outra cobrança',()=>{const db=fixture();confirmDeposit(db,event(),'local-1');db.deposits.push({id:'local-2',userId:'user-2',cents:4000,status:'CREATING'});assert.throws(()=>confirmDeposit(db,event(),'local-2'));assert.throws(()=>attachPayment(db,'local-2',{id:'remote-1',qrCode:'pix',status:'PENDING',paymentUrl:null}));assert.equal(balance(db,'user-2','deposit'),0)})
test('valor divergente, saída e método não PIX nunca creditam saldo',()=>{for(const body of [event('remote-1','41.00'),{data:{...event().data,type:'PAY_OUT'}},{data:{...event().data,paymentMethod:'crypto'}}]){const db=fixture();assert.throws(()=>confirmDeposit(db,body,'local-1'));assert.equal(db.ledger.length,0)}})
test('cobrança interrompida requer conferência; cobrança paga é preservada',()=>{const db=fixture();db.deposits[0].at=new Date(0).toISOString();reviewStaleDeposits(db);assert.equal(db.deposits[0].status,'REVIEW_REQUIRED');confirmDeposit(db,event(),'local-1');reviewStaleDeposits(db);assert.equal(db.deposits[0].status,'PAID')})
test('PIX credita somente a carteira escolhida e rejeita destino adulterado',()=>{
 const earnings=fixture('earnings');confirmDeposit(earnings,event(),'local-1')
 assert.equal(balance(earnings,'user-1','earnings'),4000);assert.equal(balance(earnings,'user-1','deposit'),0)
 const attacked=fixture('vault');assert.throws(()=>confirmDeposit(attacked,event(),'local-1'),/carteira de destino/i)
 assert.equal(attacked.ledger.length,0);assert.equal(attacked.deposits[0].status,'CREATING')
})
