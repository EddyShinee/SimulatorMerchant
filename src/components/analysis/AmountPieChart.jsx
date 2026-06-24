import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { STATUS_COLORS } from '../../config/analysisConfig.js'

export default function AmountPieChart({ data, title }) {
  if (!data?.length) return null

  return (
    <div className="space-y-2">
      {title && <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>}
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="totalAmount"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={140}
              paddingAngle={2}
              label={({ status, percent }) => `${status} ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${Number(v).toLocaleString()} VND`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
