import { useEffect, useRef, useState } from 'react'
import api from '../api/client.js'
import {
  APPLE_PAY_SESSION_VERSION,
  applePayMerchantValidationUrl,
  buildApplePayMerchantValidationBody,
  buildApplePayRequest,
  extractApplePayPaymentDataJson,
  getApplePayAvailability,
  parseApplePayMerchantSession,
} from '../utils/applePay.js'

export default function ApplePayButton({
  env = 'sandbox',
  apiUrl = '',
  paymentToken = '',
  clientId = '',
  locale = 'en',
  countryCode = 'SG',
  currencyCode = 'SGD',
  amount = 0,
  displayName = '2C2P Test Merchant',
  lineItemLabel = 'Payment',
  disabled = false,
  disabledMessage = '',
  onToken,
  onError,
  onReadyChange,
  notReadyMessage = '',
  loadingMessage = '',
}) {
  const buttonRef = useRef(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  const onReadyChangeRef = useRef(onReadyChange)

  onTokenRef.current = onToken
  onErrorRef.current = onError
  onReadyChangeRef.current = onReadyChange

  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [unavailableReason, setUnavailableReason] = useState('')

  useEffect(() => {
    const { available, reason } = getApplePayAvailability()
    setReady(available)
    setUnavailableReason(reason)
    onReadyChangeRef.current?.(available)
    setLoading(false)
  }, [])

  const handleClick = async () => {
    if (disabled) {
      if (disabledMessage) onErrorRef.current?.(new Error(disabledMessage))
      return
    }

    const availability = getApplePayAvailability()
    if (!availability.available) {
      onErrorRef.current?.(new Error(notReadyMessage || 'Apple Pay is not available'))
      return
    }

    const paymentRequest = buildApplePayRequest({
      countryCode,
      currencyCode,
      amount,
      label: displayName,
      lineItemLabel,
    })

    const session = new window.ApplePaySession(APPLE_PAY_SESSION_VERSION, paymentRequest)

    session.onvalidatemerchant = async (event) => {
      try {
        const validationApiUrl = applePayMerchantValidationUrl(env, apiUrl)
        const requestBody = buildApplePayMerchantValidationBody({
          validationUrl: event.validationURL,
          paymentToken,
          clientId,
          locale,
        })
        const { data } = await api.post('/api/simulator/proxy', {
          method: 'POST',
          url: validationApiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        })

        if (data?.error || (data?.status && (data.status < 200 || data.status >= 300))) {
          throw new Error(data?.message || `Merchant validation HTTP ${data?.status}`)
        }

        const merchantSession = parseApplePayMerchantSession(data)
        session.completeMerchantValidation(merchantSession)
      } catch (err) {
        onErrorRef.current?.(err)
        session.abort()
      }
    }

    session.onpaymentauthorized = (event) => {
      try {
        const paymentDataJson = extractApplePayPaymentDataJson(event.payment)
        onTokenRef.current?.(paymentDataJson)
        session.completePayment(window.ApplePaySession.STATUS_SUCCESS)
      } catch (err) {
        onErrorRef.current?.(err)
        session.completePayment(window.ApplePaySession.STATUS_FAILURE)
      }
    }

    session.oncancel = () => {}

    try {
      session.begin()
    } catch (err) {
      onErrorRef.current?.(err)
    }
  }

  if (disabled && disabledMessage) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-300">{disabledMessage}</p>
    )
  }

  return (
    <div className="space-y-2">
      {loading && loadingMessage ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{loadingMessage}</p>
      ) : null}
      {!loading && !ready && notReadyMessage ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {notReadyMessage}
          {unavailableReason ? ` (${unavailableReason})` : ''}
        </p>
      ) : null}
      {ready ? (
        <>
          <style>{`
            .sim-apple-pay-button {
              -webkit-appearance: -apple-pay-button;
              -apple-pay-button-type: buy;
              -apple-pay-button-style: black;
              display: inline-block;
              width: 180px;
              height: 40px;
              cursor: pointer;
            }
          `}</style>
          <button
            ref={buttonRef}
            type="button"
            className="sim-apple-pay-button relative z-10"
            aria-label="Apple Pay"
            onClick={handleClick}
          />
        </>
      ) : null}
    </div>
  )
}
