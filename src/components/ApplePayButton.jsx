import { useEffect, useRef, useState } from 'react'
import api from '../api/client.js'
import {
  APPLE_PAY_SESSION_VERSION,
  applePayMerchantValidationUrl,
  buildApplePayRequest,
  canUseApplePay,
  extractApplePayPaymentDataJson,
} from '../utils/applePay.js'

export default function ApplePayButton({
  env = 'sandbox',
  paymentToken = '',
  clientId = '',
  locale = 'en',
  countryCode = 'SG',
  currencyCode = 'SGD',
  amount = 0,
  displayName = '2C2P Test Merchant',
  lineItemLabel = 'Payment',
  disabled = false,
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

  useEffect(() => {
    const available = canUseApplePay()
    setReady(available)
    onReadyChangeRef.current?.(available)
    setLoading(false)
  }, [])

  const handleClick = async () => {
    if (disabled || !paymentToken.trim() || !clientId.trim()) {
      onErrorRef.current?.(new Error('Payment Token and Client ID are required for Apple Pay'))
      return
    }

    if (!canUseApplePay()) {
      onErrorRef.current?.(new Error('Apple Pay is not available in this browser'))
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
        const validationApiUrl = applePayMerchantValidationUrl(env)
        const { data } = await api.post('/api/simulator/proxy', {
          method: 'POST',
          url: validationApiUrl,
          headers: { 'Content-Type': 'application/json' },
          body: {
            validationUrl: event.validationURL,
            paymentToken: paymentToken.trim(),
            clientID: clientId.trim(),
            locale,
          },
        })

        let merchantSession = data?.body
        if (typeof merchantSession === 'string') {
          try {
            merchantSession = JSON.parse(merchantSession)
          } catch {
            throw new Error('Invalid merchant validation response')
          }
        }

        if (data?.error || (data?.status && (data.status < 200 || data.status >= 300))) {
          throw new Error(data?.message || `Merchant validation HTTP ${data?.status}`)
        }

        if (merchantSession?.respCode && merchantSession.respCode !== '0000') {
          throw new Error(merchantSession.respDesc || `Merchant validation failed (${merchantSession.respCode})`)
        }

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

    session.oncancel = () => {
      // user dismissed sheet — no error toast
    }

    try {
      session.begin()
    } catch (err) {
      onErrorRef.current?.(err)
    }
  }

  if (disabled) return null

  return (
    <div className="space-y-2">
      {loading && loadingMessage ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{loadingMessage}</p>
      ) : null}
      {!loading && !ready && notReadyMessage ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{notReadyMessage}</p>
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
