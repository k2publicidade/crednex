// Reset do banco local de desenvolvimento/testes.
// Remove .data/crednex.json (e backups .corrupt-* antigos) para recomeçar do zero.
// O admin é recriado no próximo start com a senha do .env (CREDNEX_ADMIN_PASSWORD).
import fs from 'node:fs'
import path from 'node:path'

const target = path.resolve(process.env.CREDNEX_DATA_FILE || '.data/crednex.json')
if (!fs.existsSync(target)) {
  console.log(`Nada a resetar: ${target} não existe.`)
  process.exit(0)
}
fs.rmSync(target)
for (const entry of fs.readdirSync(path.dirname(target)).filter(f => f.startsWith(path.basename(target) + '.corrupt-'))) {
  fs.rmSync(path.join(path.dirname(target), entry))
}
console.log(`Banco local resetado: ${target}`)
console.log('No próximo start (npm run dev ou npm start), o admin será recriado com a senha do .env.')
