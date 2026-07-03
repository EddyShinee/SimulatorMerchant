import { decodeJwtPayload } from './jwt.js'

export function parseProxyBody(respBody) {
  const respObj =
    respBody && typeof respBody === 'object'
      ? respBody
      : (() => {
          try {
            return JSON.parse(respBody)
          } catch {
            return null
          }
        })()

  let decodedResponse = null
  if (respObj?.payload) decodedResponse = decodeJwtPayload(respObj.payload)

  return { respObj, decodedResponse }
}

export function proxyErrorMessage(err, fallback) {
  const d = err?.response?.data
  return d?.message || err?.message || fallback
}
