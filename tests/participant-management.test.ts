import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('gestão: cadastro com 8 caracteres, edição, redefinição e suporte com controle de acesso',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crednex-management-'))
  process.env.CREDNEX_DATA_FILE=path.join(dir,'db.json')
  process.env.CREDNEX_ADMIN_PASSWORD='Management-admin-test'
  process.env.CREDNEX_NO_LISTEN='1'
  const {app}=await import('../server/index.js')
  const server=app.listen(0,'127.0.0.1')
  await new Promise<void>(r=>server.once('listening',r))
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`
  const call=async(url:string,body?:unknown,token?:string,method?:string)=>{
    const res=await fetch(base+url,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})
    return {status:res.status,body:await res.json()}
  }
  try{
    const admin=(await call('/auth/login',{username:'admin',password:process.env.CREDNEX_ADMIN_PASSWORD})).body
    const registration={name:'Cliente Exemplo',username:'cliente',email:'cliente@example.test',password:'Senha123'}
    assert.equal((await call('/auth/register',{...registration,password:'1234567'})).status,422)
    assert.equal((await call('/auth/register',registration)).status,200)
    const member=(await call('/auth/login',{username:'cliente',password:'Senha123'})).body
    const url=`/admin/users/${member.user.id}`
    assert.equal((await call(url,{name:'Invasor'},member.token,'PATCH')).status,403)
    assert.equal((await call(url,{role:'ADMIN_MASTER'},admin.token,'PATCH')).status,422)
    assert.equal((await call(url,{email:'admin@crednex.local'},admin.token,'PATCH')).status,422)
    assert.equal((await call(url,{name:'Nome válido',email:'inválido'},admin.token,'PATCH')).status,422)
    assert.equal((await call('/state',undefined,member.token)).body.user.name,'Cliente Exemplo')
    const edited=await call(url,{name:'Cliente Atualizado',username:'cliente.novo',email:'novo@example.test',pixKey:'novo@example.test'},admin.token,'PATCH')
    assert.equal(edited.status,200)
    assert.equal(edited.body.passwordHash,undefined)
    assert.equal((await call('/state',undefined,member.token)).body.user.name,'Cliente Atualizado')
    assert.equal((await call(url+'/password',{password:'Nova1234',confirmPassword:'Nova1234'},member.token)).status,403)
    assert.equal((await call(url+'/password',{password:'Nova1234',confirmPassword:'Diferente'},admin.token)).status,422)
    assert.equal((await call(url+'/password',{password:'curta',confirmPassword:'curta'},admin.token)).status,422)
    assert.equal((await call(`/admin/users/${admin.user.id}/password`,{password:'Nova1234',confirmPassword:'Nova1234'},admin.token)).status,403)
    assert.equal((await call(url+'/password',{password:'Nova1234',confirmPassword:'Nova1234'},admin.token)).status,200)
    assert.equal((await call('/state',undefined,member.token)).status,401)
    assert.equal((await call('/auth/login',{username:'cliente.novo',password:'Senha123'})).status,401)
    const renewed=(await call('/auth/login',{username:'cliente.novo',password:'Nova1234'})).body
    assert.ok(renewed.token)
    assert.equal((await call('/state',undefined,renewed.token)).body.support.whatsappGroupUrl,'')
    const settings={whatsappGroupUrl:'https://chat.whatsapp.com/TestInvite123'}
    assert.equal((await call('/admin/support',settings,renewed.token,'PATCH')).status,403)
    for(const link of ['javascript:alert(1)','https://chat.whatsapp.com.evil.test/token','https://evil.test/token','https://chat.whatsapp.com/'])assert.equal((await call('/admin/support',{whatsappGroupUrl:link},admin.token,'PATCH')).status,422)
    assert.equal((await call('/admin/support',settings,admin.token,'PATCH')).status,200)
    assert.equal((await call('/state',undefined,renewed.token)).body.support.whatsappGroupUrl,settings.whatsappGroupUrl)
    assert.equal((await call('/profile',{currentPassword:'Nova1234',newPassword:'Outra123'},renewed.token,'PATCH')).status,200)
    assert.equal((await call('/state',undefined,renewed.token)).status,401)
    assert.equal((await call('/auth/login',{username:'cliente.novo',password:'Outra123'})).status,200)
    const state=(await call('/admin/state',undefined,admin.token)).body
    assert.ok(state.audit.some((a:any)=>a.action==='USER_PASSWORD_RESET'&&a.actor===admin.user.id))
    assert.ok(!JSON.stringify(state).includes('Nova1234'))
    assert.ok(state.users.every((u:any)=>u.passwordHash===undefined))
  }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));fs.rmSync(dir,{recursive:true,force:true})}
})
