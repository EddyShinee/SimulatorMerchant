import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function FunnelChart({ data, title }) {
  if (!data?.length) return <p className="text-sm text-slate-400">No funnel data</p>

  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>}
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis type="category" dataKey="step" width={120} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [v, 'Count']} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.step} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
