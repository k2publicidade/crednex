// Run as root: node --env-file=/etc/crednex/crednex.env check-gateway.mjs
// Read-only checks. No charge, withdrawal or transfer is created.
const required=['PIXPAY_API_KEY','PIXPAY_API_SECRET','PIXPAY_BASE_URL','APP_PUBLIC_URL','PIXPAY_WEBHOOK_TOKEN']
const missing=required.filter(key=>!process.env[key])
if(missing.length){console.log(JSON.stringify({configured:false,missing}));process.exit(1)}
const endpoint=process.env.PIXPAY_BASE_URL+'/api/v1/currencies/crypto'
const response=await fetch(endpoint,{headers:{'X-API-Key':process.env.PIXPAY_API_KEY,'X-API-Secret':process.env.PIXPAY_API_SECRET},signal:AbortSignal.timeout(15000)})
const anonymous=await fetch(endpoint,{signal:AbortSignal.timeout(15000)})
const health=await fetch(process.env.APP_PUBLIC_URL+'/api/health',{signal:AbortSignal.timeout(15000)})
const webhook=await fetch(process.env.APP_PUBLIC_URL+'/api/webhooks/2pp?token=invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)})
const result={configured:true,gatewayAuthenticatedStatus:response.status,gatewayAnonymousStatus:anonymous.status,httpsHealthStatus:health.status,unauthorizedWebhookStatus:webhook.status,credentialsVerified:response.ok&&[401,403].includes(anonymous.status)}
console.log(JSON.stringify(result))
if(!result.credentialsVerified||!health.ok||webhook.status!==401)process.exitCode=1
