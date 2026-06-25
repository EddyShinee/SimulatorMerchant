/** Decode display token from /callback/frontend?d=... */
export function decodeCallbackDisplayToken(token) {
  if (!token) return null
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

export function parsePaymentResponseClient(raw) {
  if (raw == null || raw === '') return null
  const str = String(raw).trim()

  if (str.includes('.')) {
    try {
      const part = str.split('.')[1]
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
      return JSON.parse(atob(padded))
    } catch {
      /* fall through */
    }
  }

  try {
    return JSON.parse(atob(str))
  } catch {
    /* fall through */
  }

  try {
    return JSON.parse(str)
  } catch {
    return { raw: str }
  }
}

/** 2C2P-style response status for UI */
export function paymentResponseStatus(parsed) {
  const code = String(parsed?.respCode ?? parsed?.responseCode ?? '').trim()
  if (code === '0000') return 'success'
  if (code === '2000') return 'completed'
  if (['2001', '2002', '2003'].includes(code)) return 'pending'
  if (!code) return 'unknown'
  return 'failed'
}

export function statusTheme(status) {
  switch (status) {
    case 'success':
      return {
        ring: 'ring-green-500/30',
        bg: 'from-emerald-500 to-teal-600',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
        icon: '✓',
      }
    case 'completed':
      return {
        ring: 'ring-sky-500/30',
        bg: 'from-sky-500 to-indigo-600',
        badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
        icon: '◉',
      }
    case 'pending':
      return {
        ring: 'ring-amber-500/30',
        bg: 'from-amber-500 to-orange-500',
        badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
        icon: '…',
      }
    case 'failed':
      return {
        ring: 'ring-red-500/30',
        bg: 'from-rose-500 to-red-600',
        badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
        icon: '✕',
      }
    default:
      return {
        ring: 'ring-slate-500/30',
        bg: 'from-slate-600 to-slate-800',
        badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        icon: '?',
      }
  }
}
