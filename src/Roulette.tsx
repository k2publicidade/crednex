import {useEffect,useRef,useState,type CSSProperties} from 'react'
import {Gift,RefreshCw,ShieldCheck,Sparkles} from 'lucide-react'
import type {Rules} from './rules'

type Prize=Rules['prizes'][number]
export function Roulette({prizes,spins,draw,refresh}:{prizes:Prize[];spins:number;draw:()=>Promise<{prize:Prize}>;refresh:()=>Promise<void>}) {
  const [phase,setPhase]=useState<'idle'|'request'|'spinning'|'result'>('idle')
  const [rotation,setRotation]=useState(0),[result,setResult]=useState<Prize|null>(null),[error,setError]=useState('')
  const [segments,setSegments]=useState(prizes)
  const locked=useRef(false),mounted=useRef(true),timer=useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current)}},[])
  useEffect(()=>{if(!locked.current)setSegments(prizes)},[prizes])
  const busy=phase==='request'||phase==='spinning'
  const slices=segments.length?segments:Array.from({length:8},()=>({label:'Em breve',cents:0,weight:1}))
  const finish=()=>{if(!locked.current||!mounted.current)return;if(timer.current)clearTimeout(timer.current);locked.current=false;setPhase('result');void refresh()}
  const spin=async()=>{
    if(locked.current||!spins||!prizes.length)return
    locked.current=true;setSegments(prizes);setPhase('request');setResult(null);setError('')
    try{
      const response=await draw()
      if(!mounted.current){void refresh();return}
      setResult(response.prize)
      const index=prizes.findIndex(p=>p.label===response.prize.label&&p.cents===response.prize.cents)
      if(index<0){finish();return}
      const target=(360-(index+.5)*360/prizes.length)%360
      setRotation(previous=>previous+360*6+(target-previous%360+360)%360)
      setPhase('spinning')
      timer.current=setTimeout(finish,matchMedia('(prefers-reduced-motion: reduce)').matches?100:6300)
    }catch(e){locked.current=false;if(mounted.current){setError((e as Error).message);setPhase('idle');void refresh()}}
  }
  return <section className="luck-experience" aria-label="Roleta da sorte" aria-busy={busy}>
    <div className="luck-heading"><span className="luck-kicker"><Sparkles size={14}/> EXCLUSIVO CREDNEX</span><h2>Sua próxima surpresa<br/>começa com um <em>giro.</em></h2><p>Seus benefícios, em uma nova direção.</p></div>
    <div className={`luck-stage ${busy?'is-spinning':''} ${phase==='result'?'is-result':''}`}>
      <div className="luck-orbit"/><div className="luck-pointer"/>
      <div className="luck-rim"><div className="luck-disc" style={{transform:`rotate(${rotation}deg)`}} onTransitionEnd={e=>{if(e.target===e.currentTarget&&phase==='spinning')finish()}}>
        <svg viewBox="0 0 400 400" role="img" aria-label="Roda com os prêmios disponíveis">
          {slices.map((prize,i)=>{const step=360/slices.length,start=(i*step-90)*Math.PI/180,end=((i+1)*step-90)*Math.PI/180,angle=(i+.5)*step;return <g key={i}>
            {slices.length===1?<circle cx="200" cy="200" r="197" fill="#b8f6e4"/>:<path d={`M200 200 L${200+197*Math.cos(start)} ${200+197*Math.sin(start)} A197 197 0 ${step>180?1:0} 1 ${200+197*Math.cos(end)} ${200+197*Math.sin(end)} Z`} fill={i%2?'#0c6258':'#c8f7e8'} stroke="#61c8af" strokeWidth="1"/>}
            <g transform={`rotate(${angle} 200 200)`}><text x="200" y="66" textAnchor="middle" fill={i%2?'#dffff4':'#084c43'} fontSize={slices.length>10?12:16} fontWeight="800">{prize.label.length>17?prize.label.slice(0,15)+'…':prize.label}</text><path d="M200 85 l7 9 -7 9 -7 -9Z" fill={i%2?'#68ebc8':'#218b70'}/></g>
          </g>})}
        </svg>
      </div><svg className="luck-bulbs" viewBox="0 0 400 400" aria-hidden="true">{Array.from({length:32},(_,i)=><circle key={i} cx={200+193*Math.sin(i*Math.PI/16)} cy={200-193*Math.cos(i*Math.PI/16)} r="2.5"/>)}</svg>
      <div className="luck-hub"><Gift size={27}/><strong>CredNEX</strong><span>DA SORTE</span></div></div>
      <div className="luck-pedestal"/>
      {phase==='result'&&result&&result.cents>0&&<div className="luck-confetti" aria-hidden="true">{Array.from({length:20},(_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>}
    </div>
    <div className="luck-controls"><span className="luck-credits"><Gift size={16}/><strong>{spins}</strong> {spins===1?'giro disponível':'giros disponíveis'}</span>
      <button className="primary luck-spin" disabled={busy||!spins||!prizes.length} onClick={()=>void spin()}><RefreshCw size={19}/>{phase==='request'?'Confirmando seu giro…':phase==='spinning'?'A sorte está girando…':'Girar minha roleta'}</button>
      <div aria-live="polite" aria-atomic="true">{phase==='result'&&result&&<div className="luck-result"><Sparkles size={22}/><span>Resultado do seu giro<strong>{result.label}</strong><small>Registrado no seu histórico{result.cents>0?' • Crédito na carteira de rendimentos':''}.</small></span></div>}</div>
      {error&&<p className="alert error" role="alert">{error} Confira o histórico antes de tentar novamente.</p>}
      {!prizes.length?<p>Prêmios em preparação. Seus giros ficam guardados.</p>:!spins?<p>Você ainda não tem giros. Cada reinvestimento com saldo de rendimentos nos planos Ciclo ou Rendimento Diário libera um giro. CredCofre e ativações de indicados não geram giros.</p>:<p><ShieldCheck size={13}/> Resultado confirmado com segurança.</p>}
    </div>
    <details className="luck-rules"><summary>Como funciona e chances dos prêmios</summary><p>Cada reinvestimento com saldo de rendimentos nos planos Ciclo ou Rendimento Diário libera um giro. CredCofre e ativações de indicados não geram giros. Os segmentos são ilustrativos; as chances seguem os pesos abaixo.</p>{prizes.map((p,i)=><div key={i}><span>{p.label}</span><strong>{(p.weight/prizes.reduce((s,p)=>s+p.weight,0)*100).toFixed(2)}%</strong></div>)}</details>
  </section>
}
