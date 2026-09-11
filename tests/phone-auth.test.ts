import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {normalizePhone} from '../src/phone.js'

test('telefone: normaliza celular brasileiro e rejeita entradas inválidas',()=>{
  for(const value of ['(11) 99999-1234','11999991234','+55 (11) 99999-1234','5511999991234'])assert.equal(normalizePhone(value),'+5511999991234')
  for(const value of ['',null,11999991234,'abc11999991234','123','+1 1999991234','(11) 3333-4444'])assert.throws(()=>normalizePhone(value))
})

test('cadastro e login com telefone/senha, indicação, duplicidade e bloqueio',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crednex-phone-'))
  process.env.CREDNEX_DATA_FILE=path.join(dir,'db.json');process.env.CREDNEX_ADMIN_PASSWORD='Phone-Test-Password-2026';process.env.CREDNEX_NO_LISTEN='1'
  const {app}=await import('../server/index.js')
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`
  const call=async(url:string,body?:unknown,token?:string,method='POST')=>{
    const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})
    return {status:response.status,body:await response.json()}
  }
  try{
    const phone='(11) 99999-1234',password='Senha123'
    assert.equal((await call('/auth/register',{phone,password:'curta'})).status,422)
    assert.equal((await call('/auth/register',{phone:'123',password})).status,422)
    assert.equal((await call('/auth/register',{phone,password,inviteCode:'não-existe'})).status,422)
    const registered=await call('/auth/register',{phone,password})
    assert.equal(registered.status,200);assert.ok(registered.body.token)
    assert.equal(registered.body.user.phone,'+5511999991234');assert.equal(registered.body.user.passwordHash,undefined)
    assert.equal(registered.body.user.email,'')
    assert.equal((await call('/state',undefined,registered.body.token,'GET')).status,200)
    assert.equal((await call('/auth/register',{phone:'+5511999991234',password})).status,422)
    assert.equal((await call('/auth/login',{phone:'11999991234',password:'errada'})).status,401)
    assert.equal((await call('/auth/login',{phone:'11999991235',password})).status,401)
    const login=await call('/auth/login',{phone:'5511999991234',password})
    assert.equal(login.status,200);assert.equal(login.body.user.id,registered.body.user.id)
    const guest=await call('/auth/register',{phone:'21988881234',password,inviteCode:login.body.user.inviteCode})
    assert.equal(guest.status,200);assert.equal(guest.body.user.sponsorId,login.body.user.id)
    const sponsorState=await call('/state',undefined,login.body.token,'GET')
    assert.equal(sponsorState.body.spins.filter((s:any)=>s.status==='AVAILABLE').length,1)
    assert.equal((await call('/deposits',{amount:40,document:'12345678901'},login.body.token)).status,422)
    assert.equal((await call('/profile',{email:'inválido'},login.body.token,'PATCH')).status,422)
    assert.equal((await call('/profile',{name:'Maria Silva',email:'maria@phone.test'},login.body.token,'PATCH')).status,200)
    const admin=await call('/auth/login',{username:'admin',password:process.env.CREDNEX_ADMIN_PASSWORD})
    assert.equal(admin.status,200)
    assert.equal((await call(`/admin/users/${login.body.user.id}`,{status:'BLOCKED'},admin.body.token,'PATCH')).status,200)
    assert.equal((await call('/auth/login',{phone,password})).status,401)
    assert.equal((await call('/state',undefined,login.body.token,'GET')).status,401)
    const db=JSON.parse(fs.readFileSync(process.env.CREDNEX_DATA_FILE,'utf8'))
    assert.equal(db.users.filter((u:{phone?:string})=>u.phone==='+5511999991234').length,1)
    assert.ok(!fs.readFileSync(process.env.CREDNEX_DATA_FILE,'utf8').includes(password))
  }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));fs.rmSync(dir,{recursive:true,force:true})}
})
