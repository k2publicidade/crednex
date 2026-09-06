import crypto from 'node:crypto'
import type {Express} from 'express'
import type {createStore} from './store.js'
import {audit,id,type Db,type Account} from './engine.js'
import {hash,verify} from './passwords.js'
import {normalizePhone} from '../src/phone.js'
import {validPassword} from '../src/security.js'

export function installPhoneAuth(app:Express,store:ReturnType<typeof createStore>,safe:(user:Account)=>unknown,invite:(db:Db)=>string){
  app.post(['/api/auth/register','/api/auth/login'],async(req,res,next)=>{
    // Preserve access for existing clients and accounts using username/password.
    if(!('phone' in (req.body||{})))return next()
    try{
      const phone=normalizePhone(req.body.phone),password=req.body.password
      const result=await store.transaction(db=>{
        let user=db.users.find(u=>u.phone===phone)
        if(req.path==='/api/auth/register'){
          if(!validPassword(password))throw new Error('Use uma senha de 8 a 128 caracteres')
          if(user)throw new Error('Telefone já cadastrado. Entre com sua senha.')
          const code=req.body.inviteCode===undefined||req.body.inviteCode===''?'crednex':req.body.inviteCode
          if(typeof code!=='string'||!/^[a-z0-9]+$/i.test(code))throw new Error('Código de indicação deve conter apenas letras e números')
          const sponsor=db.users.find(u=>u.inviteCode===code&&u.status==='ACTIVE')
          if(!sponsor)throw new Error('Convite inválido')
          user={id:id(),phone,name:'Participante',username:'tel_'+crypto.randomBytes(12).toString('hex'),email:'',passwordHash:hash(password),role:'ASSOCIATE',status:'ACTIVE',sponsorId:sponsor.id,inviteCode:invite(db)}
          db.users.push(user);audit(db,user.id,'REGISTER',{method:'phone'})
        }else if(!user||user.status!=='ACTIVE'||typeof password!=='string'||!verify(password,user.passwordHash)){
          throw Object.assign(new Error('Telefone ou senha incorretos'),{status:401})
        }
        const token=crypto.randomBytes(32).toString('hex'),now=Date.now()
        for(const [key,s] of Object.entries(db.sessions))if(s.expires<now)delete db.sessions[key]
        db.sessions[crypto.createHash('sha256').update(token).digest('hex')]={userId:user.id,expires:now+12*3600000}
        return {token,user:safe(user)}
      })
      res.json(result)
    }catch(error){next(error)}
  })
}
