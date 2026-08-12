import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import FeatureRoute from './components/FeatureRoute.jsx'
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
import CreatePayout from './pages/CreatePayout.jsx'
import PayoutInquiry from './pages/PayoutInquiry.jsx'
import Settings from './pages/Settings.jsx'

function GatedApiConsole() {
  const { apiId } = useParams()
  return (
    <FeatureRoute feature={apiId}>
      <ApiConsole />
    </FeatureRoute>
  )
}

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
        <Route path="settings" element={<Settings />} />
        <Route path="access" element={<Navigate to="/app/settings" replace />} />
        <Route
          path="payment-flow"
          element={
            <FeatureRoute feature="payment-flow">
              <PaymentFlowLayout />
            </FeatureRoute>
          }
        >
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
          <Route
            path="api/payment-options"
            element={
              <FeatureRoute feature="payment-options">
                <PaymentOptions />
              </FeatureRoute>
            }
          />
          <Route
            path="api/payment-option-details"
            element={
              <FeatureRoute feature="payment-option-details">
                <PaymentOptionDetails />
              </FeatureRoute>
            }
          />
          <Route
            path="api/do-payment"
            element={
              <FeatureRoute feature="do-payment">
                <DoPayment />
              </FeatureRoute>
            }
          />
        </Route>
        <Route
          path="api/payment-token"
          element={
            <FeatureRoute feature="payment-token">
              <PaymentToken />
            </FeatureRoute>
          }
        />
        <Route
          path="api/payment-action"
          element={
            <FeatureRoute feature="payment-action">
              <PaymentAction />
            </FeatureRoute>
          }
        />
        <Route
          path="api/payment-pos"
          element={
            <FeatureRoute feature="payment-pos">
              <PaymentPos />
            </FeatureRoute>
          }
        />
        <Route
          path="api/payment-inquiry"
          element={
            <FeatureRoute feature="payment-inquiry">
              <PaymentInquiry />
            </FeatureRoute>
          }
        />
        <Route
          path="api/transaction-status-inquiry"
          element={
            <FeatureRoute feature="transaction-status-inquiry">
              <TransactionStatusInquiry />
            </FeatureRoute>
          }
        />
        <Route
          path="api/analysis"
          element={
            <FeatureRoute feature="analysis">
              <Analysis />
            </FeatureRoute>
          }
        />
        <Route path="api/:apiId" element={<GatedApiConsole />} />
        <Route
          path="pos-standalone"
          element={
            <FeatureRoute feature="pos-standalone">
              <PosStandalone />
            </FeatureRoute>
          }
        />
        <Route
          path="payout/create"
          element={
            <FeatureRoute feature="payout-create">
              <CreatePayout />
            </FeatureRoute>
          }
        />
        <Route
          path="payout/inquiry"
          element={
            <FeatureRoute feature="payout-inquiry">
              <PayoutInquiry />
            </FeatureRoute>
          }
        />
        <Route
          path="inbox"
          element={
            <FeatureRoute feature="inbox">
              <RequestInbox />
            </FeatureRoute>
          }
        />
      </Route>

      <Route path="/callback/frontend" element={<PaymentCallbackFrontend />} />

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
