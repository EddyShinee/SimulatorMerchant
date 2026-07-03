import api from '../api/client.js'
import { DEFAULT_BROWSER_DETAILS } from '../config/paymentOptionsConfig.js'
import { PAYMENT_OPTION_DETAILS_ENVIRONMENTS } from '../config/paymentOptionDetailsConfig.js'
import { PAYMENT_OPTIONS_ENVIRONMENTS } from '../config/paymentOptionsConfig.js'
import { parsePaymentOptionDetails } from './paymentOptionParse.js'

function randomClientId() {
  return crypto.randomUUID()
}

/** Match Details URL to the Options environment / custom URL. */
export function resolveDetailsUrl(env, optionsUrl = '') {
  if (env !== 'custom') {
    return PAYMENT_OPTION_DETAILS_ENVIRONMENTS[env] || PAYMENT_OPTION_DETAILS_ENVIRONMENTS.sandbox
  }

  for (const key of Object.keys(PAYMENT_OPTIONS_ENVIRONMENTS)) {
    if (optionsUrl === PAYMENT_OPTIONS_ENVIRONMENTS[key]) {
      return PAYMENT_OPTION_DETAILS_ENVIRONMENTS[key]
    }
  }

  if (/paymentoption$/i.test(optionsUrl)) {
    return optionsUrl.replace(/paymentoption$/i, 'paymentoptiondetails')
  }
  if (/paymentOption$/i.test(optionsUrl)) {
    return optionsUrl.replace(/paymentOption$/i, 'paymentOptionDetails')
  }

  return PAYMENT_OPTION_DETAILS_ENVIRONMENTS.sandbox
}

export async function fetchPaymentOptions({
  url,
  paymentToken,
  clientId,
  locale = 'en',
  browserDetails = DEFAULT_BROWSER_DETAILS,
  signal,
}) {
  const payload = {
    paymentToken: paymentToken.trim(),
    clientID: (clientId || randomClientId()).trim(),
    locale: locale.trim() || 'en',
    browserDetails,
  }

  const { data } = await api.post(
    '/api/simulator/proxy',
    {
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    },
    { signal }
  )

  return { proxy: data, requestPayload: payload }
}

export async function fetchPaymentOptionDetails({
  url,
  paymentToken,
  categoryCode,
  groupCode,
  clientId,
  locale = 'en',
  signal,
}) {
  const payload = {
    paymentToken: paymentToken.trim(),
    clientID: (clientId || randomClientId()).trim(),
    locale: locale.trim() || 'en',
    categoryCode: categoryCode.trim(),
    groupCode: groupCode.trim(),
  }

  const { data } = await api.post(
    '/api/simulator/proxy',
    {
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    },
    { signal }
  )

  return { proxy: data, requestPayload: payload }
}

/** Loop Payment Option Details for every category+group from Payment Options. */
export async function fetchAllPaymentOptionDetails({
  url,
  paymentToken,
  categories,
  clientId,
  locale = 'en',
  signal,
  onProgress,
}) {
  const results = []

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    onProgress?.({
      current: i + 1,
      total: categories.length,
      categoryCode: cat.categoryCode,
      groupCode: cat.groupCode,
      label: `${cat.categoryCode} / ${cat.groupCode}`,
    })

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const { proxy, requestPayload } = await fetchPaymentOptionDetails({
      url,
      paymentToken,
      categoryCode: cat.categoryCode,
      groupCode: cat.groupCode,
      clientId,
      locale,
      signal,
    })

    const parsed = parsePaymentOptionDetails(proxy?.body)
    const httpOk = proxy?.status >= 200 && proxy?.status < 300

    results.push({
      categoryCode: cat.categoryCode,
      categoryName: cat.categoryName,
      groupCode: cat.groupCode,
      groupName: cat.groupName,
      ok: httpOk && parsed.ok,
      respCode: parsed.respCode,
      respDesc: parsed.respDesc,
      channels: parsed.channels || [],
      requestPayload,
      response: proxy?.body,
      status: proxy?.status,
    })
  }

  return results
}
