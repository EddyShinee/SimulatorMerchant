import {
  FINVIET_STATUS_OPTIONS,
  FINVIET_PAYMENT_STATUS_OPTIONS,
  FINVIET_PAYMENT_CHANNEL_OPTIONS,
  FINVIET_CARD_TYPE_OPTIONS,
  FINVIET_CARD_ORIGIN_OPTIONS,
} from '../config/finvietNotificationConfig.js'
import { formatFinvietTimestamp, finvietFieldLabel } from '../utils/finvietNotificationForm.js'

function Field({ label, children, className = '', hint }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  )
}

function AutoTimestampField({ fieldKey, value, hint }) {
  return (
    <Field label={finvietFieldLabel(fieldKey)} hint={hint}>
      <div className="input font-mono text-xs text-slate-600 dark:text-slate-300">
        {value}
        <span className="ml-2 text-slate-400">({formatFinvietTimestamp(value)})</span>
      </div>
    </Field>
  )
}

export default function FinvietNotificationBodyForm({ form, onChange, onRegenerateSignature, signing, t }) {
  const set = (key, value) => onChange({ ...form, [key]: value })
  const L = finvietFieldLabel

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <p className="mb-2 text-xs text-amber-900 dark:text-amber-100">{t('posStandalone.finvietSignSpec')}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={t('posStandalone.finvietSecretKey')}>
            <input
              className="input font-mono text-xs"
              type="text"
              autoComplete="off"
              value={form.secretKey}
              onChange={(e) => set('secretKey', e.target.value)}
              placeholder={t('posStandalone.finvietSecretKeyHint')}
            />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-secondary whitespace-nowrap text-xs"
              disabled={signing}
              onClick={onRegenerateSignature}
            >
              {signing ? t('posStandalone.finvietSigning') : t('posStandalone.finvietRegenerateSignature')}
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('posStandalone.finvietSectionMain')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={L('amount')}>
            <input
              className="input font-mono text-xs"
              type="number"
              min="0"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </Field>
          <Field label={L('currency')}>
            <input className="input font-mono text-xs" value={form.currency} onChange={(e) => set('currency', e.target.value)} />
          </Field>
          <Field label={L('status')}>
            <select className="input text-xs" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {FINVIET_STATUS_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <AutoTimestampField fieldKey="timestamp" value={form.timestamp} hint={t('posStandalone.finvietTimestampAuto')} />
          <Field label={L('store_code')}>
            <input className="input font-mono text-xs" value={form.storeCode} onChange={(e) => set('storeCode', e.target.value)} />
          </Field>
          <Field label={L('retail_app_id')}>
            <input
              className="input font-mono text-xs"
              value={form.retailAppId}
              onChange={(e) => set('retailAppId', e.target.value)}
            />
          </Field>
          <Field label={L('signature')} className="sm:col-span-2">
            <input
              className="input font-mono text-xs"
              readOnly
              value={form.signature}
              placeholder={t('posStandalone.finvietSignatureAuto')}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('posStandalone.finvietSectionMerchant')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={L('merchant_code')}>
            <input
              className="input font-mono text-xs"
              value={form.merchantCode}
              onChange={(e) => set('merchantCode', e.target.value)}
            />
          </Field>
          <Field label={L('merchant_bill_id')} hint={t('posStandalone.finvietMerchantBillIdAuto')}>
            <div className="input font-mono text-xs text-slate-600 dark:text-slate-300">{form.merchantBillId}</div>
          </Field>
          <Field label={L('store_code_partner')}>
            <input
              className="input font-mono text-xs"
              value={form.storeCodePartner}
              onChange={(e) => set('storeCodePartner', e.target.value)}
            />
          </Field>
          <Field label={L('merchant_code_partner')}>
            <input
              className="input font-mono text-xs"
              value={form.merchantCodePartner}
              onChange={(e) => set('merchantCodePartner', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={L('ref_code')}>
            <input className="input font-mono text-xs" value={form.refCode} onChange={(e) => set('refCode', e.target.value)} />
          </Field>
          <Field label={L('payment_transid')}>
            <input
              className="input font-mono text-xs"
              value={form.paymentTransid}
              onChange={(e) => set('paymentTransid', e.target.value)}
            />
          </Field>
          <Field label={L('payment_status')}>
            <select
              className="input text-xs"
              value={form.paymentStatus}
              onChange={(e) => set('paymentStatus', e.target.value)}
            >
              {FINVIET_PAYMENT_STATUS_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('payment_channel')}>
            <select
              className="input text-xs"
              value={form.paymentChannel}
              onChange={(e) => set('paymentChannel', e.target.value)}
            >
              {FINVIET_PAYMENT_CHANNEL_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('approve_code')} hint={t('posStandalone.finvietApproveCodeAuto')}>
            <div className="input font-mono text-xs text-slate-600 dark:text-slate-300">{form.approveCode}</div>
          </Field>
          <Field label={L('error_code')}>
            <input
              className="input font-mono text-xs"
              value={form.errorCode}
              onChange={(e) => set('errorCode', e.target.value)}
              placeholder={t('posStandalone.optional')}
            />
          </Field>
          <Field label={L('error_msg')} className="sm:col-span-2">
            <input
              className="input font-mono text-xs"
              value={form.errorMsg}
              onChange={(e) => set('errorMsg', e.target.value)}
              placeholder={t('posStandalone.optional')}
            />
          </Field>
          <AutoTimestampField fieldKey="created_at" value={form.createdAt} hint={t('posStandalone.finvietTimestampAuto')} />
          <AutoTimestampField fieldKey="success_at" value={form.successAt} hint={t('posStandalone.finvietTimestampAuto')} />
          <AutoTimestampField fieldKey="updated_at" value={form.updatedAt} hint={t('posStandalone.finvietTimestampAuto')} />
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.isGlobal} onChange={(e) => set('isGlobal', e.target.checked)} />
            {L('is_global')}
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.isTimeout} onChange={(e) => set('isTimeout', e.target.checked)} />
            {L('is_timeout')}
          </label>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Customer Info</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={L('customer_name')}>
            <input
              className="input font-mono text-xs"
              value={form.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              placeholder={t('posStandalone.optional')}
            />
          </Field>
          <Field label={L('card_info.card_type')}>
            <select className="input text-xs" value={form.cardType} onChange={(e) => set('cardType', e.target.value)}>
              {FINVIET_CARD_TYPE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('card_info.card_number')}>
            <input
              className="input font-mono text-xs"
              value={form.cardNumber}
              onChange={(e) => set('cardNumber', e.target.value)}
              placeholder="545909****0362"
            />
          </Field>
          <Field label={L('card_info.card_origin')}>
            <select className="input text-xs" value={form.cardOrigin} onChange={(e) => set('cardOrigin', e.target.value)}>
              {FINVIET_CARD_ORIGIN_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label={L('card_info.card_holder')}>
            <input
              className="input font-mono text-xs"
              value={form.cardHolder}
              onChange={(e) => set('cardHolder', e.target.value)}
              placeholder={t('posStandalone.optional')}
            />
          </Field>
        </div>
      </div>
    </div>
  )
}
