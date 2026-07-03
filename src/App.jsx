import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import SimulatorLayout from './layouts/SimulatorLayout.jsx'
import PaymentFlowLayout from './layouts/PaymentFlowLayout.jsx'
import ApiPaymentLayout from './layouts/ApiPaymentLayout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ApiConsole from './pages/ApiConsole.jsx'
import PaymentToken from './pages/PaymentToken.jsx'
import DoPayment from './pages/DoPayment.jsx'
import PaymentAction from './pages/PaymentAction.jsx'
import PaymentPos from './pages/PaymentPos.jsx'
import PaymentInquiry from './pages/PaymentInquiry.jsx'
import TransactionStatusInquiry from './pages/TransactionStatusInquiry.jsx'
import PaymentOptions from './pages/PaymentOptions.jsx'
import PaymentOptionDetails from './pages/PaymentOptionDetails.jsx'
import Analysis from './pages/Analysis.jsx'
import PosStandalone from './pages/PosStandalone.jsx'
import RequestInbox from './pages/RequestInbox.jsx'
import PaymentFlowHub from './pages/PaymentFlowHub.jsx'
import PaymentCallbackFrontend from './pages/PaymentCallbackFrontend.jsx'

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
        <Route path="payment-flow" element={<PaymentFlowLayout />}>
          <Route index element={<PaymentFlowHub />} />
          <Route path="token" element={<PaymentToken />} />
          <Route path="options" element={<PaymentOptions />} />
          <Route path="details" element={<PaymentOptionDetails />} />
          <Route path="pay" element={<DoPayment />} />
          <Route path="inbox" element={<RequestInbox />} />
          <Route path="inquiry" element={<PaymentInquiry />} />
          <Route path="status" element={<TransactionStatusInquiry />} />
        </Route>
        <Route element={<ApiPaymentLayout />}>
          <Route path="api/payment-options" element={<PaymentOptions />} />
          <Route path="api/payment-option-details" element={<PaymentOptionDetails />} />
          <Route path="api/do-payment" element={<DoPayment />} />
        </Route>
        <Route path="api/payment-token" element={<PaymentToken />} />
        <Route path="api/payment-action" element={<PaymentAction />} />
        <Route path="api/payment-pos" element={<PaymentPos />} />
        <Route path="api/payment-inquiry" element={<PaymentInquiry />} />
        <Route path="api/transaction-status-inquiry" element={<TransactionStatusInquiry />} />
        <Route path="api/analysis" element={<Analysis />} />
        <Route path="api/:apiId" element={<ApiConsole />} />
        <Route path="pos-standalone" element={<PosStandalone />} />
        <Route path="inbox" element={<RequestInbox />} />
      </Route>

      <Route path="/callback/frontend" element={<PaymentCallbackFrontend />} />

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
