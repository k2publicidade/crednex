import fs from 'node:fs'
import crypto from 'node:crypto'
if(fs.existsSync('.env')) {console.log('.env já existe. Configuração preservada.');process.exit(0)}
const password=crypto.randomBytes(18).toString('base64url')
fs.writeFileSync('.env',`CREDNEX_ADMIN_USERNAME=admin\nCREDNEX_ADMIN_EMAIL=admin@crednex.local\nCREDNEX_ADMIN_PASSWORD=${password}\nPORT=4020\nCRON_SECRET=${crypto.randomBytes(32).toString('hex')}\n`)
console.log('Configuração local criada. Usuário: admin. A senha está no arquivo .env (CREDNEX_ADMIN_PASSWORD). Execute npm run dev.')
