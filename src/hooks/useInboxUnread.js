import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api/client.js'

const LAST_SEEN_KEY = 'sim_inbox_last_seen'

export function useInboxUnread(pollIntervalMs = 10000) {
  const location = useLocation()
  const [unread, setUnread] = useState(0)

  const markSeen = useCallback(() => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    setUnread(0)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/api/simulator/requests')
      const reqs = data.requests || []
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY)
      if (!lastSeen) {
        setUnread(reqs.length)
        return
      }
      const since = new Date(lastSeen).getTime()
      setUnread(reqs.filter((r) => new Date(r.receivedAt).getTime() > since).length)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, pollIntervalMs)
    return () => clearInterval(id)
  }, [refresh, pollIntervalMs])

  useEffect(() => {
    if (location.pathname.endsWith('/inbox')) markSeen()
  }, [location.pathname, markSeen])

  return { unread, markSeen, refresh }
}
