import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { STATUS_COLORS } from '../../config/analysisConfig.js'

function pivotSeries(data, valueKey) {
  const buckets = [...new Set(data.map((d) => d.bucket))].sort()
  const statuses = [...new Set(data.map((d) => d.status))].sort()
  return {
    chartData: buckets.map((bucket) => {
      const row = { bucket }
      for (const status of statuses) {
        row[status] = data.find((d) => d.bucket === bucket && d.status === status)?.[valueKey] ?? 0
      }
      return row
    }),
    statuses,
  }
}

export default function StatusTimeChart({
  data,
  valueKey = 'count',
  chartType = 'Bar',
  title,
  yLabel,
  stacked = false,
  yMax,
  valueFormatter = (v) => v,
}) {
  const { chartData, statuses } = pivotSeries(data, valueKey)
  if (!chartData.length) {
    return <p className="text-sm text-slate-400">No chart data</p>
  }

  const common = {
    data: chartData,
    margin: { top: 8, right: 16, left: 8, bottom: 8 },
  }

  const renderSeries = (ChartComponent, seriesType) =>
    statuses.map((status) => (
      <ChartComponent
        key={status}
        type={seriesType}
        dataKey={status}
        name={status}
        stackId={stacked ? 'a' : undefined}
        fill={STATUS_COLORS[status] || undefined}
        stroke={STATUS_COLORS[status] || undefined}
        dot={seriesType === 'monotone' ? { r: 3 } : undefined}
      />
    ))

  let chart
  if (chartType === 'Line') {
    chart = (
      <LineChart {...common}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} domain={yMax != null ? [0, yMax] : undefined} />
        <Tooltip formatter={(v) => valueFormatter(v)} />
        <Legend />
        {renderSeries(Line, 'monotone')}
      </LineChart>
    )
  } else if (chartType === 'Area') {
    chart = (
      <AreaChart {...common}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} domain={yMax != null ? [0, yMax] : undefined} />
        <Tooltip formatter={(v) => valueFormatter(v)} />
        <Legend />
        {renderSeries(Area, 'monotone')}
      </AreaChart>
    )
  } else {
    chart = (
      <BarChart {...common}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="bucket" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} domain={yMax != null ? [0, yMax] : undefined} />
        <Tooltip formatter={(v) => valueFormatter(v)} />
        <Legend />
        {statuses.map((status) => (
          <Bar
            key={status}
            dataKey={status}
            name={status}
            stackId={stacked ? 'a' : undefined}
            fill={STATUS_COLORS[status] || undefined}
          />
        ))}
      </BarChart>
    )
  }

  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>}
      {yLabel && <p className="text-xs text-slate-400">{yLabel}</p>}
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
