import crypto from 'node:crypto'
export const hash=(password:string)=>{const salt=crypto.randomBytes(16).toString('hex');return `scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`}
export const verify=(password:string,encoded:string)=>{const [,salt,digest]=encoded.split('$');return !!salt&&!!digest&&/^[a-f0-9]{128}$/.test(digest)&&crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(digest,'hex'))}
