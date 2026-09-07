import {PLANS,planName,type Rules} from './rules.js'
export type PlanFamily='cycle'|'daily'|'vault'
export interface Plan {id:string;name:string;family:PlanFamily;days:number;min:number;max:number;bps:number;active:boolean;returnPrincipal?:boolean}
export const initialPlans=():Plan[]=>PLANS.map(p=>({...p,family:p.family as PlanFamily,name:planName(p.id),active:true,...(p.family!=='daily'?{returnPrincipal:true}:{})}))
export const returnsPrincipal=(plan:Plan,rules:Rules)=>plan.returnPrincipal??(plan.family==='cycle'||plan.family==='vault'||rules.returnPrincipal)
export function validatePlan(input:unknown):Plan {
 if(!input||typeof input!=='object')throw new Error('Informe os dados do plano')
 const p=input as Plan
 if(typeof p.id!=='string'||! /^[A-Z0-9][A-Z0-9-]{1,39}$/.test(p.id))throw new Error('Código: use 2 a 40 letras maiúsculas, números ou hífen')
 if(typeof p.name!=='string'||p.name.trim().length<2||p.name.trim().length>80)throw new Error('Nome deve ter de 2 a 80 caracteres')
 if(!['cycle','daily','vault'].includes(p.family))throw new Error('Modalidade inválida')
 if(!Number.isSafeInteger(p.min)||!Number.isSafeInteger(p.max)||p.min<1||p.max<p.min||p.max>100_000_000)throw new Error('Faixa de valores inválida (máximo R$ 1.000.000)')
 if(!Number.isSafeInteger(p.bps)||p.bps<1||p.bps>10_000)throw new Error('Taxa diária deve ser de 0,01% a 100%')
 if(!Number.isSafeInteger(p.days)||(p.family==='vault'?p.days!==0:p.days<1||p.days>3650))throw new Error('Prazo deve ser de 1 a 3650 dias; Credcofre usa prazo zero')
 if(typeof p.active!=='boolean'||typeof p.returnPrincipal!=='boolean')throw new Error('Informe ativação e devolução de capital')
 if(p.family==='vault'&&!p.returnPrincipal)throw new Error('Credcofre deve permitir resgate do capital')
 return {id:p.id,name:p.name.trim(),family:p.family,days:p.days,min:p.min,max:p.max,bps:p.bps,active:p.active,returnPrincipal:p.returnPrincipal}
}
