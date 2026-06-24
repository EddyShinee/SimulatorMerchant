import { useMemo, useState } from 'react'
import {
  CHART_TYPES,
  TIME_FILTERS,
} from '../config/analysisConfig.js'
import {
  addTimeBucket,
  computeProfileStats,
  computeSuccessRate,
  countByGroupAndStatus,
  formatDateTime,
  pivotTable,
  rateByGroupAndStatus,
  sumAmountByGroupAndStatus,
  sumAmountByStatus,
} from '../utils/transactionAnalysis.js'
import StatusTimeChart from './analysis/StatusTimeChart.jsx'
import SingleSeriesChart from './analysis/SingleSeriesChart.jsx'
import AmountPieChart from './analysis/AmountPieChart.jsx'

function Metric({ label, value }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}

function RadioGroup({ label, options, value, onChange }) {
  return (
    <div>
      {label && <p className="label">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
              value === opt
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function PivotTable({ pivot, valueFormat = (v) => v }) {
  if (!pivot?.rows?.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="px-2 py-2 font-semibold">Bucket</th>
            {pivot.cols.map((c) => (
              <th key={c} className="px-2 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((row) => (
            <tr key={row.bucket} className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-2 py-1.5 font-mono">{row.bucket}</td>
              {pivot.cols.map((c) => (
                <td key={c} className="px-2 py-1.5">
                  {valueFormat(row.values[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-slate-800 dark:text-slate-100"
      >
        {title}
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">{children}</div>}
    </div>
  )
}

export default function AnalysisDashboard({ rows, meta }) {
  const profile = useMemo(() => computeProfileStats(rows), [rows])

  const [timeCount, setTimeCount] = useState('Day')
  const [chartCount, setChartCount] = useState('Bar')
  const [timeRate, setTimeRate] = useState('Day')
  const [chartRate, setChartRate] = useState('Bar')
  const [timeAmount, setTimeAmount] = useState('Day')
  const [chartAmount, setChartAmount] = useState('Bar')
  const [timeSr, setTimeSr] = useState('Day')
  const [chartSrCount, setChartSrCount] = useState('Line')
  const [chartSrRate, setChartSrRate] = useState('Line')

  const hasStatus = rows.some((r) => r.status)
  const hasAmount = rows.some((r) => r.transactionAmount != null)

  const countData = useMemo(() => {
    const { rows: bucketed, groupCol } = addTimeBucket(rows, timeCount)
    return { data: countByGroupAndStatus(bucketed, groupCol), groupCol }
  }, [rows, timeCount])

  const rateData = useMemo(() => {
    const { rows: bucketed, groupCol } = addTimeBucket(rows, timeRate)
    return rateByGroupAndStatus(bucketed, groupCol)
  }, [rows, timeRate])

  const amountData = useMemo(() => {
    const { rows: bucketed, groupCol } = addTimeBucket(rows, timeAmount)
    return sumAmountByGroupAndStatus(bucketed, groupCol)
  }, [rows, timeAmount])

  const srData = useMemo(() => {
    const { rows: bucketed, groupCol } = addTimeBucket(rows, timeSr)
    return computeSuccessRate(bucketed, groupCol)
  }, [rows, timeSr])

  const pieData = useMemo(() => sumAmountByStatus(rows), [rows])

  const statusEntries = Object.entries(profile.statusCounts).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total Transactions" value={profile.total} />
        <Metric label="Response Time" value={`${(meta.durationMs / 1000).toFixed(2)}s`} />
        <Metric label="Status Code" value={meta.status} />
      </div>

      <Section title="📋 Profile Report Information">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total Transactions" value={profile.total} />
          <Metric
            label="Total Amount"
            value={hasAmount ? `${profile.totalAmount.toLocaleString()} VND` : 'N/A'}
          />
          <Metric label="Approved" value={hasStatus ? profile.approved : 'N/A'} />
          <Metric label="Rejected" value={hasStatus ? profile.rejected : 'N/A'} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Status Distribution</h4>
            {hasStatus ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-1 text-left">Status</th>
                    <th className="py-1 text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {statusEntries.map(([status, count]) => (
                    <tr key={status} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1">{status}</td>
                      <td className="py-1 text-right">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-400">Status column not found</p>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Amount Statistics</h4>
            {profile.amountStats ? (
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="py-1">Min</td>
                    <td className="py-1 text-right">{profile.amountStats.min.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Max</td>
                    <td className="py-1 text-right">{profile.amountStats.max.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-1">Mean</td>
                    <td className="py-1 text-right">{Math.round(profile.amountStats.mean).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-400">Transaction Amount column not found</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
            📅 From: {formatDateTime(profile.dateMin)}
          </p>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800">
            📅 To: {formatDateTime(profile.dateMax)}
          </p>
        </div>
      </Section>

      {hasStatus && (
        <>
          <Section title="📈 Number of Transactions by Status">
            <div className="mb-4 space-y-3">
              <RadioGroup label="Time Filter" options={TIME_FILTERS} value={timeCount} onChange={setTimeCount} />
              <RadioGroup label="Chart Type" options={CHART_TYPES} value={chartCount} onChange={setChartCount} />
            </div>
            <StatusTimeChart data={countData.data} chartType={chartCount} valueKey="count" />
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-brand-600">View Data Table</summary>
              <div className="mt-2">
                <PivotTable pivot={pivotTable(countData.data, 'bucket', 'status', 'count')} />
              </div>
            </details>
          </Section>

          <Section title="📊 Payment Rate by Status">
            <div className="mb-4 space-y-3">
              <RadioGroup label="Time Filter" options={TIME_FILTERS} value={timeRate} onChange={setTimeRate} />
              <RadioGroup label="Chart Type" options={CHART_TYPES} value={chartRate} onChange={setChartRate} />
            </div>
            <StatusTimeChart
              data={rateData}
              chartType={chartRate}
              valueKey="rate"
              stacked
              yMax={100}
              valueFormatter={(v) => `${v}%`}
            />
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-brand-600">View Data Table</summary>
              <div className="mt-2">
                <PivotTable
                  pivot={pivotTable(rateData, 'bucket', 'status', 'rate')}
                  valueFormat={(v) => `${v}%`}
                />
              </div>
            </details>
          </Section>
        </>
      )}

      {hasStatus && hasAmount && (
        <Section title="💰 Total Amount Statistics by Status">
          <div className="mb-4 space-y-3">
            <RadioGroup label="Time Filter" options={TIME_FILTERS} value={timeAmount} onChange={setTimeAmount} />
            <RadioGroup label="Chart Type" options={CHART_TYPES} value={chartAmount} onChange={setChartAmount} />
          </div>
          <StatusTimeChart
            data={amountData.map((d) => ({ ...d, count: d.totalAmount }))}
            chartType={chartAmount}
            valueKey="count"
            valueFormatter={(v) => `${Number(v).toLocaleString()} VND`}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Total Amount (All Status)"
              value={`${amountData.reduce((s, d) => s + d.totalAmount, 0).toLocaleString()} VND`}
            />
            <Metric
              label="Total Amount (Approved)"
              value={`${amountData.filter((d) => d.status === 'Approved').reduce((s, d) => s + d.totalAmount, 0).toLocaleString()} VND`}
            />
            <Metric
              label="Total Amount (Settled)"
              value={`${amountData.filter((d) => d.status === 'Settled').reduce((s, d) => s + d.totalAmount, 0).toLocaleString()} VND`}
            />
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-brand-600">View Data Table</summary>
            <div className="mt-2">
              <PivotTable
                pivot={pivotTable(amountData, 'bucket', 'status', 'totalAmount')}
                valueFormat={(v) => Number(v).toLocaleString()}
              />
            </div>
          </details>
          <div className="mt-6">
            <AmountPieChart data={pieData} title="Total Amount Distribution by Status" />
          </div>
        </Section>
      )}

      {hasStatus && (
        <Section title="✅ Success Rate Analysis">
          <div className="mb-4">
            <RadioGroup label="Time Filter" options={TIME_FILTERS} value={timeSr} onChange={setTimeSr} />
          </div>
          <div className="space-y-6">
            <div>
              <RadioGroup
                label="Chart Type (SR Count)"
                options={['Line', 'Area', 'Bar']}
                value={chartSrCount}
                onChange={setChartSrCount}
              />
              <SingleSeriesChart
                data={srData}
                yKey="srCount"
                chartType={chartSrCount}
                title="Success Rate Count (Approved + Settled)"
                color="#2E86AB"
              />
            </div>
            <div>
              <RadioGroup
                label="Chart Type (SR Rate)"
                options={['Line', 'Area', 'Bar']}
                value={chartSrRate}
                onChange={setChartSrRate}
              />
              <SingleSeriesChart
                data={srData}
                yKey="srRate"
                chartType={chartSrRate}
                title="Success Rate Percentage"
                color="#F77F00"
                yMax={100}
                valueFormatter={(v) => `${v}%`}
              />
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-brand-600">View Success Rate Data Table</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-2 py-1 text-left">Bucket</th>
                    <th className="px-2 py-1 text-right">SR Count</th>
                    <th className="px-2 py-1 text-right">SR Rate (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {srData.map((row) => (
                    <tr key={row.bucket} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1 font-mono">{row.bucket}</td>
                      <td className="px-2 py-1 text-right">{row.srCount}</td>
                      <td className="px-2 py-1 text-right">{row.srRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Section>
      )}

      <Section title="📋 Raw Data (first 100 rows)" defaultOpen={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {Object.keys(rows[0] || {})
                  .filter((k) => !['parsedDateTime', 'status', 'transactionAmount'].includes(k))
                  .slice(0, 12)
                  .map((col) => (
                    <th key={col} className="whitespace-nowrap px-2 py-1 text-left font-semibold">
                      {col}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  {Object.keys(rows[0] || {})
                    .filter((k) => !['parsedDateTime', 'status', 'transactionAmount'].includes(k))
                    .slice(0, 12)
                    .map((col) => (
                      <td key={col} className="whitespace-nowrap px-2 py-1">
                        {row[col]}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
