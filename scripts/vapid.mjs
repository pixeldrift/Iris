// Prints a fresh VAPID key pair for Web Push: node scripts/vapid.mjs
import webpush from 'web-push'
const k = webpush.generateVAPIDKeys()
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@example.com\nCRON_SECRET=${crypto.randomUUID().replaceAll('-', '')}`)
