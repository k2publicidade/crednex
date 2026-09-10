import {ArrowDownLeft,ArrowUpRight,Users,ShieldCheck} from 'lucide-react'
import {operationMetrics} from './operationMetrics'
import './admin-overview.css'

const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100)
export function AdminOverviewMetrics({data}:{data:Record<string,any>}) {
  const m=operationMetrics(data)
  const cards=[
    {label:'Pessoas cadastradas',icon:Users,today:String(m.todayPeople),total:String(m.totalPeople),hint:'Participantes, sem administradores',tone:'people'},
    {label:'Cadastros ativos',icon:ShieldCheck,today:String(m.todayActive),total:String(m.totalActive),hint:'Dos cadastros de hoje, com conta ativa',tone:'active'},
    {label:'Entradas de caixa',icon:ArrowDownLeft,today:money(m.todayIn),total:money(m.totalIn),hint:'Depósitos PIX confirmados · valor bruto',tone:'in'},
    {label:'Saídas de caixa',icon:ArrowUpRight,today:money(m.todayOut),total:money(m.totalOut),hint:'Saques pagos · valor líquido enviado',tone:'out'},
    {label:'Projeção para amanhã',icon:ArrowUpRight,today:money(m.projectedNet),total:money(m.projectedGross),hint:'Estimativa líquida com base nos rendimentos diários dos planos ativos',tone:'projection'},
  ]
  return <section className="operation-control" aria-labelledby="operation-control-title">
    <header className="control-heading"><div><span className="eyebrow">RESUMO DA OPERAÇÃO</span><h2 id="operation-control-title">Seu controle, em números.</h2></div><span className="control-date">Hoje · {m.day.split('-').reverse().join('/')}<small>Horário de São Paulo</small></span></header>
    <div className="control-grid">{cards.map(({label,icon:Icon,today,total,hint,tone})=><article className={`control-card control-${tone}`} key={label}><header><h3>{label}</h3><Icon size={20} aria-hidden="true"/></header><span className="control-period">HOJE</span><strong className="control-value">{today}</strong><p>{hint}</p><div className="control-total"><span>Acumulado<small>{tone==='active'?'Contas ativas atualmente':'Total registrado'}</small></span><strong>{total}</strong></div></article>)}</div>
    <div className="control-context"><span><b>{m.pendingCount} saques pendentes</b><small>{money(m.pendingOut)} líquidos a pagar</small></span><span><b>{m.activeContracts} aplicações ativas</b><small>Ciclos, NEX e Credcofre</small></span><p>Conta ativa não significa aplicação ativa. Ajustes de saldo, rendimentos e transferências internas não são entradas de caixa.</p></div>
    {(m.unknownUsers>0||m.unknownPayments>0)&&<p className="control-history">Histórico sem data: {m.unknownUsers} cadastros e {m.unknownPayments} pagamentos aparecem apenas no acumulado.</p>}
  </section>
}
