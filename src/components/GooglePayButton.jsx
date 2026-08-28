import { useEffect, useRef, useState } from 'react'
import {
  buildGooglePayConfig,
  checkGooglePayReady,
  getGooglePaymentsClient,
  loadGooglePayScript,
  requestGooglePayToken,
} from '../utils/googlePay.js'

export default function GooglePayButton({
  environment = 'TEST',
  gatewayMerchantId = '',
  googleMerchantId = '',
  googleMerchantName = '2C2P Test Merchant',
  amount = 0,
  currencyCode = 'SGD',
  disabled = false,
  onToken,
  onError,
  onReadyChange,
  notReadyMessage = '',
  loadingMessage = '',
}) {
  const containerRef = useRef(null)
  const configRef = useRef(null)
  const onTokenRef = useRef(onToken)
  const onErrorRef = useRef(onError)
  const onReadyChangeRef = useRef(onReadyChange)

  onTokenRef.current = onToken
  onErrorRef.current = onError
  onReadyChangeRef.current = onReadyChange

  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      setReady(false)
      if (containerRef.current) containerRef.current.replaceChildren()

      const gatewayMid = String(gatewayMerchantId || '').trim()
      if (!gatewayMid || disabled) {
        setLoading(false)
        onReadyChangeRef.current?.(false)
        return
      }

      try {
        await loadGooglePayScript()
        const config = buildGooglePayConfig({
          environment,
          gatewayMerchantId: gatewayMid,
          googleMerchantId,
          googleMerchantName,
          amount,
          currencyCode,
        })
        configRef.current = config

        const isReady = await checkGooglePayReady(config)
        if (cancelled) return

        setReady(isReady)
        onReadyChangeRef.current?.(isReady)

        if (!isReady || !containerRef.current) {
          setLoading(false)
          return
        }

        const client = getGooglePaymentsClient(environment)
        const button = client.createButton({
          onClick: async () => {
            try {
              const token = await requestGooglePayToken(configRef.current)
              onTokenRef.current?.(token)
            } catch (err) {
              onErrorRef.current?.(err)
            }
          },
        })

        if (cancelled || !containerRef.current) return

        containerRef.current.replaceChildren(button)
      } catch (err) {
        if (!cancelled) {
          setReady(false)
          onReadyChangeRef.current?.(false)
          onErrorRef.current?.(err)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [
    environment,
    gatewayMerchantId,
    googleMerchantId,
    googleMerchantName,
    amount,
    currencyCode,
    disabled,
  ])

  if (disabled || !String(gatewayMerchantId || '').trim()) return null

  return (
    <div className="space-y-2">
      {loading && loadingMessage ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{loadingMessage}</p>
      ) : null}
      {!loading && !ready && notReadyMessage ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{notReadyMessage}</p>
      ) : null}
      <div
        ref={containerRef}
        className="relative z-10 inline-flex min-h-[40px] items-center [&_button]:pointer-events-auto"
      />
    </div>
  )
}
