/** Brazilian mobile numbers are stored in E.164, including country code. */
export function normalizePhone(value:unknown):string {
  if(typeof value!=='string'||value.length>25||!/^[+\d\s().-]+$/.test(value))throw new Error('Informe um celular válido com DDD')
  let digits=value.replace(/\D/g,'')
  if(digits.length===11&&!value.trim().startsWith('+'))digits='55'+digits
  if(!/^55[1-9][0-9]9[0-9]{8}$/.test(digits))throw new Error('Informe um celular válido com DDD')
  return '+'+digits
}
