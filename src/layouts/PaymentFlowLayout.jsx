import { Outlet } from 'react-router-dom'
import PaymentFlowBar from '../components/PaymentFlowBar.jsx'
import PaymentFlowWizard from '../components/PaymentFlowWizard.jsx'

/** Shell for the dedicated Payment Flow section — wizard + session only here. */
export default function PaymentFlowLayout() {
  return (
    <div className="space-y-5">
      <PaymentFlowWizard />
      <PaymentFlowBar />
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
