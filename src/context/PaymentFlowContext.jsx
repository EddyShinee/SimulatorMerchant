import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { loadPaymentPresets, savePaymentPresets } from '../utils/paymentPresets.js'

const PaymentFlowContext = createContext(null)

export function PaymentFlowProvider({ children }) {
  const [flow, setFlow] = useState(() => loadPaymentPresets())

  const updateFlow = useCallback((partial) => {
    setFlow((prev) => {
      const next = savePaymentPresets({ ...prev, ...partial })
      return next
    })
  }, [])

  const recordStep = useCallback((stepId, status = 'success', meta = {}) => {
    setFlow((prev) => {
      const entry = { stepId, status, at: new Date().toISOString(), ...meta }
      const existing = prev.flowTimeline || []
      const timeline = [...existing.filter((e) => e.stepId !== stepId), entry].slice(-12)
      return savePaymentPresets({ ...prev, flowTimeline: timeline })
    })
  }, [])

  const clearTimeline = useCallback(() => {
    updateFlow({ flowTimeline: [] })
  }, [updateFlow])

  const value = useMemo(
    () => ({ flow, updateFlow, recordStep, clearTimeline }),
    [flow, updateFlow, recordStep, clearTimeline]
  )

  return <PaymentFlowContext.Provider value={value}>{children}</PaymentFlowContext.Provider>
}

export function usePaymentFlow() {
  const ctx = useContext(PaymentFlowContext)
  if (!ctx) throw new Error('usePaymentFlow must be used within PaymentFlowProvider')
  return ctx
}
