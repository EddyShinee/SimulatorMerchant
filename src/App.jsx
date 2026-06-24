import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import SimulatorLayout from './layouts/SimulatorLayout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ApiConsole from './pages/ApiConsole.jsx'
import PaymentToken from './pages/PaymentToken.jsx'
import DoPayment from './pages/DoPayment.jsx'
import PaymentAction from './pages/PaymentAction.jsx'
import PaymentPos from './pages/PaymentPos.jsx'
import RequestInbox from './pages/RequestInbox.jsx'

// Redirect authenticated users away from auth pages.
function PublicOnly({ children }) {
  const { isAuthenticated, initializing } = useAuth()
  if (initializing) return null
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <SimulatorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="api/payment-token" element={<PaymentToken />} />
        <Route path="api/do-payment" element={<DoPayment />} />
        <Route path="api/payment-action" element={<PaymentAction />} />
        <Route path="api/payment-pos" element={<PaymentPos />} />
        <Route path="api/:apiId" element={<ApiConsole />} />
        <Route path="inbox" element={<RequestInbox />} />
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
