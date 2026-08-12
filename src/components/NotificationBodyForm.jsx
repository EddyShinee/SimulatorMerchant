import {
  TRAN_STATUSES,
  TRAN_TYPES,
  PAYMENT_METHODS,
  CURRENCY_OPTIONS,
} from '../config/posStandaloneConfig.js'

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export default function NotificationBodyForm({
  form,
  onChange,
  t,
  plainPan = '',
  aesKey = '',
  onPlainPanChange,
  onAesKeyChange,
  onEncryptCardPan,
  encrypting = false,
  showVtcJwtHint = false,
}) {
  const set = (key, value) => onChange({ ...form, [key]: value })

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('posStandalone.notifSectionTransaction')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="tranId">
            <input className="input font-mono text-xs" value={form.tranId} onChange={(e) => set('tranId', e.target.value)} />
          </Field>
          <Field label="linkedTranId">
            <input
              className="input font-mono text-xs"
              value={form.linkedTranId}
              onChange={(e) => set('linkedTranId', e.target.value)}
            />
          </Field>
          <Field label="tranType">
            <select className="input text-xs" value={form.tranType} onChange={(e) => set('tranType', e.target.value)}>
              {TRAN_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="tranStatus">
            <select className="input text-xs" value={form.tranStatus} onChange={(e) => set('tranStatus', e.target.value)}>
              {TRAN_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="paymentMethod">
            <select
              className="input text-xs"
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
            >
              {PAYMENT_METHODS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="posReference">
            <input
              className="input font-mono text-xs"
              value={form.posReference}
              onChange={(e) => set('posReference', e.target.value)}
            />
          </Field>
          <Field label="approvalCode">
            <input
              className="input font-mono text-xs"
              value={form.approvalCode}
              onChange={(e) => set('approvalCode', e.target.value)}
              placeholder={t('posStandalone.optional')}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('posStandalone.notifSectionAmount')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="amount.currency">
            <select
              className="input text-xs"
              value={form.amountCurrency}
              onChange={(e) => set('amountCurrency', e.target.value)}
            >
              {CURRENCY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="amount.value">
            <input
              className="input font-mono text-xs"
              type="number"
              min="0"
              step="any"
              value={form.amountValue}
              onChange={(e) => set('amountValue', e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">{t('posStandalone.amountValueHint')}</p>
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('posStandalone.notifSectionCard')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="issCountryCode">
            <input
              className="input font-mono text-xs"
              value={form.issCountryCode}
              onChange={(e) => set('issCountryCode', e.target.value)}
              placeholder="0702"
            />
          </Field>
          <Field label="deviceAlias">
            <input
              className="input font-mono text-xs"
              value={form.deviceAlias}
              onChange={(e) => set('deviceAlias', e.target.value)}
            />
          </Field>

          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/40">
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('posStandalone.cardEncryptTitle')}
            </p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('posStandalone.cardEncryptHint')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('posStandalone.plainPan')}>
                <input
                  className="input font-mono text-xs"
                  value={plainPan}
                  onChange={(e) => onPlainPanChange?.(e.target.value)}
                  placeholder={t('posStandalone.plainPanHint')}
                  autoComplete="off"
                />
              </Field>
              <Field label={t('posStandalone.aesKey')}>
                <input
                  className="input font-mono text-xs"
                  type="password"
                  value={aesKey}
                  onChange={(e) => onAesKeyChange?.(e.target.value)}
                  placeholder={t('posStandalone.aesKeyHint')}
                  autoComplete="off"
                />
              </Field>
            </div>
            <button
              type="button"
              className="btn-secondary mt-3 text-xs"
              disabled={encrypting || !plainPan.trim() || !aesKey.trim()}
              onClick={onEncryptCardPan}
            >
              {encrypting ? t('posStandalone.encryptingCardPan') : t('posStandalone.encryptCardPan')}
            </button>
          </div>

          <Field label="cardPan" className="sm:col-span-2">
            <input
              className="input font-mono text-xs"
              value={form.cardPan}
              onChange={(e) => set('cardPan', e.target.value)}
              placeholder={t('posStandalone.cardPanHint')}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">extraData</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="extraData.merchantId">
            <input
              className="input font-mono text-xs"
              value={form.merchantId}
              onChange={(e) => set('merchantId', e.target.value)}
            />
          </Field>
          <Field label="extraData.subMid">
            <input className="input font-mono text-xs" value={form.subMid} onChange={(e) => set('subMid', e.target.value)} />
          </Field>
          <Field label="extraData.subTid">
            <input className="input font-mono text-xs" value={form.subTid} onChange={(e) => set('subTid', e.target.value)} />
          </Field>
          <Field label="extraData.jwtSecret" className="sm:col-span-2">
            <input
              className="input font-mono text-xs"
              type="text"
              value={form.jwtSecret}
              onChange={(e) => set('jwtSecret', e.target.value)}
              placeholder={t('posStandalone.jwtSecretHint')}
            />
            {showVtcJwtHint ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t('posStandalone.vtcJwtSecretHint')}</p>
            ) : null}
          </Field>
        </div>
      </div>
    </div>
  )
}
