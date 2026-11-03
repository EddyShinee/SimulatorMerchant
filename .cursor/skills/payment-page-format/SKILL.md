---
name: payment-page-format
description: >-
  Build Simulator Merchant payment API pages with the shared Payment Token
  page shell (method badge, split panel, environment card, merchant vault,
  secret key, results column) and pretty-prints JSON and XML in result cards.
  Use when adding or restyling a payment menu,
  API page, or screen such as Payment Token, Payment Inquiry, Payment Action,
  or Payment V3, or when the user asks for the common page format.
---

# Payment page format

Copy the shell in `src/pages/PaymentToken.jsx`. Payment Inquiry is the smaller example of the same shell. Keep API-specific fields and signing logic; do not invent a second layout.

## Page shell

```jsx
<div className="space-y-6">
  <LoadingOverlay show={loading} onCancel={cancel} />
  <div className="flex flex-wrap items-center gap-3">
    <span className="rounded-md bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
      POST
    </span>
    <h1 className="page-title">{t('page.title')}</h1>
  </div>

  <div className="split-panel">
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">
        ⚙️ {t('paymentToken.configuration')}
      </h2>

      <div className="card space-y-4 p-4">
        <div className="form-grid-3">
          {/* environment select + API URL (sm:col-span-2, font-mono text-xs) */}
        </div>
      </div>

      <div className="card space-y-4 p-4">
        <h3 className="font-semibold text-slate-800">{t('paymentToken.basicInfo')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* merchantID input + MerchantVaultPicker, then API fields */}
        </div>
      </div>

      {/* Optional fields: collapsed card, full-width button, border-t body */}

      <div className="card p-4">
        <label className="label">🔑 {t('paymentToken.secretKey')}</label>
        <input type="password" className="input font-mono text-xs" />
      </div>

      {/* amber warning box only when there is an error */}

      <button className="btn-primary w-full" disabled={loading}>
        {loading ? t('page.sending') : `🚀 ${t('page.send')}`}
      </button>
    </div>

    <div className="result-panel space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">📊 {t('paymentToken.results')}</h2>
      {!result ? (
        <div className="card p-8 text-center text-sm text-slate-400">
          {t('paymentToken.noResult')}
        </div>
      ) : (
        <div className="result-panel space-y-4">
          <ExchangeSummary result={result} method="POST" />
          {/* one card per payload: JsonResultCard. JSON/XML format themselves. */}
        </div>
      )}
    </div>
  </div>
</div>
```

Rules:

- No subtitle under the title. The method badge and `page-title` are the header.
- Left column is configuration. Right column is `result-panel`. Do not show the live request on the right before a send; the empty card is `paymentToken.noResult`.
- Labels use `label`. Controls use `input`. Cards use `card`.
- Environment options come from that API's config: sandbox, production, and `custom`. Editing the URL sets env to `custom`. Changing the select writes `ENVIRONMENTS[env]`.
- Merchant ID sits beside `MerchantVaultPicker`, shown only when `isFeatureOn('merchant-vault')`. On select, copy mid, secret key, and `vaultEnvToPageEnv(environment)` into the form and `updateFlow`.
- Secret key is its own card, `type="password"`, under the fields and above the send button.
- Optional parameters use the Payment Token advanced block: `card overflow-hidden`, a full-width toggle, `+` / `−`, body in `border-t border-slate-100 p-4`.
- Warnings use `rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700`.
- Result cards use `JsonResultCard`. Leave `language` at `auto` for JSON and XML. `formatStructuredText` (`src/utils/formatStructuredText.js`) indents both; `CodeBlock` highlights JSON and colors XML. Pass `language="text"` only for values that must stay raw, such as a Base64 payload or a hex signature. The copy button copies the formatted text.
- After a response, render `ExchangeSummary` first, then the request that was sent, then the raw response, then the decoded body.
- `ExchangeSummary` colors the card and the HTTP status from the HTTP code: 2xx green, 3xx amber, 4xx and 5xx red. `respCode` is colored on its own: `00`, `000`, `0000`, and `2000` are green; pending codes such as `001` and `2001`–`2003` are amber; every other code is red. Do not let `respCode` recolor the HTTP status.

## Request behavior

Use `useAbortableLoading`. Pass `start()` as `signal` to `api.post`. On cancel, toast `common.requestCancelled` and still store a result via `stampExchange`. Map failures with `proxyErrorMessage(err, t('errors.network'))`.

Send through `POST /api/simulator/proxy` unless the API already has a dedicated route (Payment Action does). Stamp `stampExchange(startedAt)` onto the result. On success, `updateFlow` with `merchantId`, `secretKey`, and the invoice or transaction code, then toast `common.requestSuccess`.

## Register the page

Use one id everywhere, for example `payment-v3`.

1. `src/config/<name>Config.js` — `ENVIRONMENTS` and `ENV_OPTIONS`.
2. `src/pages/<Page>.jsx` — the shell above.
3. `src/config/apis.js` — `API_CATALOG` entry for Payment 4.x pages only. The "Choose API" sidebar reads this list.
4. `src/config/accessControl.js` — same id in the `api` feature group for Payment 4.x. Payment V3 stays in its own `payment-v3` group and its own sidebar section (`nav.sectionPaymentV3`), not in Choose API, so it is not mixed with Payment V4.
5. `src/App.jsx` — static route `api/<id>` wrapped in `<FeatureRoute feature="<id>">`, next to the other API routes.
6. `src/i18n/translations.js` — `apis.<key>` plus the page's own strings in **both** `vi` and `en`. Reuse `paymentToken.configuration`, `basicInfo`, `environment`, `apiUrl`, `secretKey`, `results`, `noResult`, and `rawResponse`.

`SimulatorLayout` titles the page from `API_CATALOG`. Add a Dashboard quick action only when the user asks for one.

Read `src/pages/PaymentToken.jsx` before editing a page so class names and section order stay aligned with that file.

## Version

A user-facing change bumps the patch version before the work is finished. `APP_VERSION` in `src/config/appVersion.js` reads `version` from `package.json`, and the sidebar brand shows that value.

```bash
npm version patch --no-git-tag-version
```

That updates `package.json` and `package-lock.json` only. Do not create a git tag. Skip the bump for comment-only edits.
