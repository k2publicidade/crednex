import {useState,type FormEvent} from 'react'
import {Plus,Pencil} from 'lucide-react'
import {returnsPrincipal,type Plan} from './catalog'
import {activePlanLimit,amount,type Rules} from './rules'
const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100)
const families={cycle:'Ciclo',daily:'Rendimento diário',vault:'Credcofre'}
export function PlanCatalog({plans,rules,save}:{plans:Plan[];rules:Rules;save:(body:Record<string,unknown>,id?:string)=>Promise<void>}) {
 const [editing,setEditing]=useState<Plan|null|undefined>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const edit=(plan:Plan|null)=>{setError('');setEditing(plan)}
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(busy)return
  const v=Object.fromEntries(new FormData(event.currentTarget));setBusy(true);setError('')
  try{const family=String(v.family),body={id:String(v.id).trim().toUpperCase(),name:String(v.name),family,min:amount(v.min),max:amount(v.max),bps:amount(v.rate),days:family==='vault'?0:Number(v.days),active:v.active==='on',returnPrincipal:family==='vault'||v.returnPrincipal==='on',maxActive:Number(v.maxActive)};await save(body,editing?.id);setEditing(undefined)}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="plan-catalog"><div className="section-heading"><div><h2>Planos disponíveis para contratação</h2><p>Cadastre os produtos oferecidos aos participantes. Somente planos ativos aparecem para novas compras.</p></div><button className="primary" onClick={()=>edit(null)} disabled={busy}><Plus size={18}/>Cadastrar plano</button></div>
 <div className="info-strip">Comissões: 10%, 3% e 2% nos três níveis elegíveis, sobre {rules.commissionBase==='deposit'?'a aplicação confirmada':'os rendimentos'}. Ganhos entram na Carteira de Rendimentos. Saques exigem pacote ativo.</div>
 {editing!==undefined&&<section className="panel plan-editor"><h3>{editing?'Editar plano':'Cadastrar plano'}</h3><p>Alterações valem apenas para novas contratações. O capital depositado continua sem permissão de saque.</p>{error&&<div className="alert error" role="alert">{error}</div>}<form key={editing?.id??'new'} onSubmit={submit}><div className="plan-editor-grid">
 <label>Código do plano<input name="id" required minLength={2} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9-]+" readOnly={!!editing} defaultValue={editing?.id??''}/></label>
 <label>Nome exibido<input name="name" required minLength={2} maxLength={80} defaultValue={editing?.name??''}/></label>
 <label>Modalidade<select name="family" defaultValue={editing?.family??'cycle'}>{Object.entries(families).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label>Taxa diária (%)<input name="rate" required type="number" min="0.01" max="100" step="0.01" defaultValue={(editing?.bps??600)/100}/></label>
 <label>Valor mínimo (R$)<input name="min" required type="number" min="0.01" max="1000000" step="0.01" defaultValue={(editing?.min??2500)/100}/></label>
 <label>Valor máximo (R$)<input name="max" required type="number" min="0.01" max="1000000" step="0.01" defaultValue={(editing?.max??10000)/100}/></label>
 <label>Prazo em dias (Credcofre usa zero)<input name="days" required type="number" min="0" max="3650" step="1" defaultValue={editing?.days??30}/></label>
 <label>Máximo ativo por participante<input name="maxActive" required type="number" min="1" step="1" defaultValue={editing?activePlanLimit(rules,editing.id):2}/></label>
 </div><label className="check"><input type="checkbox" name="returnPrincipal" defaultChecked={editing?returnsPrincipal(editing,rules):true}/>Devolver o capital ao final (Credcofre sempre devolve no resgate)</label><label className="check"><input type="checkbox" name="active" defaultChecked={editing?.active??true}/>Ativo e disponível para novas compras</label><div className="inline-actions"><button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar plano'}</button><button type="button" className="outline" disabled={busy} onClick={()=>setEditing(undefined)}>Cancelar</button></div></form></section>}
 <div className="plans-grid">{plans.map(p=><article className="panel catalog-card" key={p.id}><div className="section-heading"><span className={`badge ${p.active?'active':'closed'}`}>{p.active?'Ativo':'Inativo'}</span><small>{p.id}</small></div><h3>{p.name}</h3><p>{families[p.family]} · {p.days?`${p.days} dias`:'Prazo flexível'}</p><strong>{(p.bps/100).toLocaleString('pt-BR')}% ao dia</strong><p>{p.min===p.max?money(p.min):`${money(p.min)} a ${money(p.max)}`}</p><p>Limite: {activePlanLimit(rules,p.id)} por participante<br/>Capital: {returnsPrincipal(p,rules)?'devolvido à carteira de origem':'sem devolução adicional'}</p><button className="outline" onClick={()=>edit(p)} disabled={busy}><Pencil size={16}/>Editar / ativar ou desativar</button></article>)}</div>
 </section>
}
