import { useCallback, useRef, useState } from 'react'

export function useAbortableLoading() {
  const abortRef = useRef(null)
  const [loading, setLoading] = useState(false)

  const start = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    return abortRef.current.signal
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }, [])

  const stop = useCallback(() => {
    abortRef.current = null
    setLoading(false)
  }, [])

  return { loading, start, cancel, stop, isAbortError: (err) => err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' }
}
