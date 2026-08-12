import crypto from 'crypto'
import { finvietPreSignString, sortObjectKeysDeep } from '../../src/utils/finvietSignature.js'

export { sortObjectKeysDeep, finvietPreSignString }

export function finvietSignSync(payload, secretKey) {
  const secret = String(secretKey || '')
  if (!secret) throw new Error('FinViet secret key is required.')
  return crypto.createHmac('sha256', secret).update(finvietPreSignString(payload)).digest('hex')
}

export function finvietBodyWithSignatureSync(payload, secretKey) {
  const body = sortObjectKeysDeep({ ...payload })
  delete body.signature
  const signature = finvietSignSync(body, secretKey)
  return { ...body, signature }
}
