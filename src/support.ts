export interface SupportSettings {whatsappGroupUrl:string}
export const DEFAULT_SUPPORT:SupportSettings={whatsappGroupUrl:''}
export function validateSupport(value:unknown):SupportSettings {
  if(!value||typeof value!=='object'||!('whatsappGroupUrl' in value)||typeof value.whatsappGroupUrl!=='string')throw new Error('Informe o link do grupo de suporte')
  const text=value.whatsappGroupUrl.trim()
  if(!text)return {whatsappGroupUrl:''}
  let url:URL
  try{url=new URL(text)}catch{throw new Error('Link do WhatsApp inválido')}
  if(url.protocol!=='https:'||url.hostname!=='chat.whatsapp.com'||url.username||url.password||url.port||!/^\/[a-zA-Z0-9]+\/?$/.test(url.pathname))throw new Error('Use um convite https://chat.whatsapp.com/ para o grupo de suporte')
  return {whatsappGroupUrl:url.href}
}
