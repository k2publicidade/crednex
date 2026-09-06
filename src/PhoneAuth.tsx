import {useState,type FormEvent} from 'react'
import {ArrowRight} from 'lucide-react'
import {ApiClient,type Session} from './api'
import {normalizePhone} from './phone'

export function PhoneAuth({register,onSession}:{register:boolean;onSession:(session:Session)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(busy)return
    const values=new FormData(e.currentTarget)
    setBusy(true);setError('')
    try{
      const api=new ApiClient(null)
      const session=await api.post<Session>(register?'/auth/register':'/auth/login',{phone:normalizePhone(values.get('phone')),password:values.get('password'),...(register?{inviteCode:new URLSearchParams(location.search).get('ref')||'crednex'}:{})})
      onSession(session)
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <form onSubmit={submit}>
    <label>Telefone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" required maxLength={25}/></label>
    <label>Senha {register&&<small>(mínimo de 8 caracteres)</small>}<input name="password" type="password" required minLength={register?8:1} maxLength={register?128:undefined} autoComplete={register?'new-password':'current-password'}/></label>
    {error&&<div className="alert error" role="alert">{error}</div>}
    <button className="primary" disabled={busy}>{busy?'Processando…':register?'Criar minha conta':'Entrar na plataforma'}<ArrowRight size={16}/></button>
  </form>
}
