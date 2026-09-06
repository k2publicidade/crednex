import {useState,type FormEvent} from 'react'
import {ArrowRight} from 'lucide-react'
import {ApiClient,type Session} from './api'
import {normalizePhone} from './phone'
import {loginIdentity} from './login'

export function PhoneAuth({register,onSession}:{register:boolean;onSession:(session:Session)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(busy)return
    const values=new FormData(e.currentTarget)
    setBusy(true);setError('')
    try{
      const api=new ApiClient(null)
      const identity=register?{phone:normalizePhone(values.get('phone'))}:loginIdentity(values.get('phone'))
      const session=await api.post<Session>(register?'/auth/register':'/auth/login',{...identity,password:values.get('password'),...(register?{inviteCode:new URLSearchParams(location.search).get('ref')||'crednex'}:{})})
      onSession(session)
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <form onSubmit={submit}>
    <label>{register?'Telefone':'Telefone ou usuário'}<input name="phone" type={register?'tel':'text'} inputMode={register?'tel':'text'} autoComplete={register?'tel':'username'} placeholder={register?'(11) 99999-9999':'Seu telefone ou usuário'} required maxLength={register?25:40}/></label>
    <label>Senha {register&&<small>(mínimo de 8 caracteres)</small>}<input name="password" type="password" required minLength={register?8:1} maxLength={register?128:undefined} autoComplete={register?'new-password':'current-password'}/></label>
    {error&&<div className="alert error" role="alert">{error}</div>}
    <button className="primary" disabled={busy}>{busy?'Processando…':register?'Criar minha conta':'Entrar na plataforma'}<ArrowRight size={16}/></button>
  </form>
}
