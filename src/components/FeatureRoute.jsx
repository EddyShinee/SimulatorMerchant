import { Navigate } from 'react-router-dom'
import { useAccess } from '../context/AccessContext.jsx'

export default function FeatureRoute({ feature, adminOnly = false, children }) {
  const { isAdmin, canAccess, loading } = useAccess()

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
      </div>
    )
  }

  if (adminOnly && !isAdmin) return <Navigate to="/app" replace />
  if (feature && !canAccess(feature)) return <Navigate to="/app" replace />
  return children
}
