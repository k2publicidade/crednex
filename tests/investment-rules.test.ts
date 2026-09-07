import test from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_RULES,validatePlanLimits,projectedReturn,remainingDays,DAY} from '../src/rules.js'
import {emptyDb,accrue,balance} from '../server/engine.js'

test('contrato legado preserva os 35 dias e 8% registrados, sem adotar o novo catálogo',()=>{
 const db=emptyDb()
 db.contracts.push({id:'legacy',userId:'old-user',planId:'C-1',principal:10000,bps:800,days:35,paidDays:0,startedAt:'2026-01-01T00:00:00Z',status:'ACTIVE',returnPrincipal:true,commissionBase:'deposit'})
 accrue(db,new Date('2026-03-01T00:00:00Z'))
 assert.equal(db.contracts[0].paidDays,35)
 assert.equal(balance(db,'old-user','earnings'),28000)
 assert.equal(balance(db,'old-user','deposit'),10000)
 assert.equal(accrue(db,new Date('2026-03-02T00:00:00Z')),0)
})
test('limites rejeitam valores inválidos e planos ausentes ou desconhecidos',()=>{
 const limits=DEFAULT_RULES.activePlanLimits
 assert.deepEqual(validatePlanLimits(limits),limits)
 for(const value of [null,[],{}, {...limits,'C-1':0},{...limits,'C-1':1.5},{...limits,'C-1':'2'},{...limits,'C-1':-1},{...limits,UNKNOWN:2}])assert.throws(()=>validatePlanLimits(value))
})
test('simulação de R$55 e arredondamento coincidem com créditos diários',()=>{
 assert.deepEqual(projectedReturn(5500,600,30,true),{daily:330,earnings:9900,capital:5500,total:15400})
 assert.equal(projectedReturn(5501,650,30,true).earnings,357*30)
 assert.equal(projectedReturn(5000,400,50,false).total,10000)
 assert.equal(projectedReturn(5000,400,50,true).total,15000)
})
test('dias restantes respeitam 24h completas e prazo flexível',()=>{
 const start='2026-09-01T15:00:00Z',at=Date.parse(start)
 assert.equal(remainingDays(start,35,new Date(at+DAY-1)),35)
 assert.equal(remainingDays(start,35,new Date(at+DAY)),34)
 assert.equal(remainingDays(start,35,new Date(at+35*DAY)),0)
 assert.equal(remainingDays(start,35,new Date(at+40*DAY)),0)
 assert.equal(remainingDays(start,0,new Date(at)),null)
})
