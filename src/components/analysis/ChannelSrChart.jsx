import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function ChannelSrChart({ data, title }) {
  if (!data?.length) return <p className="text-sm text-slate-400">No channel data</p>

  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>}
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="channel" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
            <Tooltip formatter={(v, name) => [`${v}%`, name]} />
            <Bar dataKey="srRate" name="SR Rate" fill="#2E86AB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="declineRate" name="Decline Rate" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
