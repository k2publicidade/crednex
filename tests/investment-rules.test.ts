import test from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_RULES,validatePlanLimits,projectedReturn,remainingDays,DAY} from '../src/rules.js'
test('limites rejeitam valores inválidos e planos ausentes ou desconhecidos',()=>{
 const limits=DEFAULT_RULES.activePlanLimits
 assert.deepEqual(validatePlanLimits(limits),limits)
 for(const value of [null,[],{}, {...limits,'C-1':0},{...limits,'C-1':1.5},{...limits,'C-1':'2'},{...limits,'C-1':-1},{...limits,UNKNOWN:2}])assert.throws(()=>validatePlanLimits(value))
})
test('simulação de R$55 e arredondamento coincidem com créditos diários',()=>{
 assert.deepEqual(projectedReturn(5500,800,35,true),{daily:440,earnings:15400,capital:5500,total:20900})
 assert.equal(projectedReturn(5501,900,35,true).earnings,495*35)
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
