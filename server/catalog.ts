import {initialPlans,returnsPrincipal,validatePlan,type Plan} from '../src/catalog.js'
import {audit,type Db} from './engine.js'
export const catalog=(db:Db):Plan[]=>db.plans??initialPlans()
export function savePlan(db:Db,actor:string,input:unknown,existingId?:string) {
 const plans=catalog(db),body=input as Record<string,unknown>
 if(existingId&&!plans.some(p=>p.id===existingId))throw new Error('Plano não encontrado')
 if(existingId&&body?.id!==undefined&&body.id!==existingId)throw new Error('O código do plano não pode ser alterado')
 const previous=plans.find(p=>p.id===existingId)
 const plan=validatePlan({...previous,...(previous?{returnPrincipal:returnsPrincipal(previous,db.rules)}:{}),...body,...(existingId?{id:existingId}:{})})
 if(!existingId&&plans.some(p=>p.id===plan.id))throw new Error('Já existe um plano com esse código')
 const limit=body.maxActive??db.rules.activePlanLimits[plan.id]??2
 if(!Number.isSafeInteger(limit)||Number(limit)<1)throw new Error('Limite de aplicações deve ser inteiro positivo')
 db.plans=existingId?plans.map(p=>p.id===existingId?plan:p):[...plans,plan]
 db.rules.activePlanLimits[plan.id]=Number(limit)
 audit(db,actor,existingId?'PLAN_UPDATED':'PLAN_CREATED',{before:previous,after:plan,maxActive:limit})
 return plan
}
