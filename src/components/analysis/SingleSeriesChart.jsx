import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export default function SingleSeriesChart({
  data,
  xKey = 'bucket',
  yKey,
  chartType = 'Line',
  title,
  color = '#2E86AB',
  yMax,
  valueFormatter = (v) => v,
}) {
  if (!data?.length) return <p className="text-sm text-slate-400">No chart data</p>

  const common = {
    data,
    margin: { top: 8, right: 16, left: 8, bottom: 8 },
  }

  let chart
  if (chartType === 'Bar') {
    chart = (
      <BarChart {...common}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} domain={yMax != null ? [0, yMax] : undefined} />
        <Tooltip formatter={(v) => valueFormatter(v)} />
        <Bar dataKey={yKey} fill={color} />
      </BarChart>
    )
  } else if (chartType === 'Area') {
    chart = (
      <AreaChart {...common}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} domain={yMax != null ? [0, yMax] : undefined} />
        <Tooltip formatter={(v) => valueFormatter(v)} />
        <Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={0.35} />
      </AreaChart>
    )
  } else {
    chart = (
      <LineChart {...common}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} domain={yMax != null ? [0, yMax] : undefined} />
        <Tooltip formatter={(v) => valueFormatter(v)} />
        <Line type="monotone" dataKey={yKey} stroke={color} dot={{ r: 3 }} />
      </LineChart>
    )
  }

  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>}
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
