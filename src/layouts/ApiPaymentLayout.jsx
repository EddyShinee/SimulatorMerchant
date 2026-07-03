import { Outlet } from 'react-router-dom'
import PaymentFlowBar from '../components/PaymentFlowBar.jsx'

/** Payment Options / Details / Do Payment API pages — show session bar. */
export default function ApiPaymentLayout() {
  return (
    <div className="space-y-5">
      <PaymentFlowBar />
      <Outlet />
    </div>
  )
}
