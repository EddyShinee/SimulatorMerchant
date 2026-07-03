export const WIZARD_STEPS = [
  {
    id: 'payment-token',
    path: '/app/payment-flow/token',
    labelKey: 'wizard.steps.token',
    shortKey: 'wizard.steps.tokenShort',
    descKey: 'wizard.steps.tokenDesc',
  },
  {
    id: 'payment-options',
    path: '/app/payment-flow/options',
    labelKey: 'wizard.steps.options',
    shortKey: 'wizard.steps.optionsShort',
    descKey: 'wizard.steps.optionsDesc',
  },
  {
    id: 'payment-option-details',
    path: '/app/payment-flow/details',
    labelKey: 'wizard.steps.details',
    shortKey: 'wizard.steps.detailsShort',
    descKey: 'wizard.steps.detailsDesc',
  },
  {
    id: 'do-payment',
    path: '/app/payment-flow/pay',
    labelKey: 'wizard.steps.doPayment',
    shortKey: 'wizard.steps.doPaymentShort',
    descKey: 'wizard.steps.doPaymentDesc',
  },
  {
    id: 'inbox',
    path: '/app/payment-flow/inbox',
    labelKey: 'wizard.steps.inbox',
    shortKey: 'wizard.steps.inboxShort',
    descKey: 'wizard.steps.inboxDesc',
  },
  {
    id: 'payment-inquiry',
    path: '/app/payment-flow/inquiry',
    labelKey: 'wizard.steps.inquiry',
    shortKey: 'wizard.steps.inquiryShort',
    descKey: 'wizard.steps.inquiryDesc',
  },
  {
    id: 'transaction-status',
    path: '/app/payment-flow/status',
    labelKey: 'wizard.steps.txnStatus',
    shortKey: 'wizard.steps.txnStatusShort',
    descKey: 'wizard.steps.txnStatusDesc',
  },
]

const FLOW_PREFIX = '/app/payment-flow'

export function isPaymentFlowRoute(pathname) {
  return pathname === FLOW_PREFIX || pathname.startsWith(`${FLOW_PREFIX}/`)
}

export function getWizardStepIndex(pathname) {
  if (pathname === FLOW_PREFIX || pathname === `${FLOW_PREFIX}/`) return -1
  return WIZARD_STEPS.findIndex((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))
}

export function getNextWizardStep(pathname) {
  const idx = getWizardStepIndex(pathname)
  if (idx < 0) return WIZARD_STEPS[0]
  if (idx >= WIZARD_STEPS.length - 1) return null
  return WIZARD_STEPS[idx + 1]
}

const DONE_STATUSES = new Set(['success', 'received', 'viewed'])

export function isWizardStepDone(stepId, flowTimeline = []) {
  const entry = flowTimeline.find((e) => e.stepId === stepId)
  return entry != null && DONE_STATUSES.has(entry.status)
}

/** Suggest the next incomplete step from saved timeline. */
export function getSuggestedNextStep(flow) {
  const timeline = flow?.flowTimeline || []
  for (const step of WIZARD_STEPS) {
    if (!isWizardStepDone(step.id, timeline)) return step
  }
  return null
}
