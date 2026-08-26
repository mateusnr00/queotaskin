"use client";

// Gráfico de vendas (últimos 60 minutos), agrupado por minuto e por status.
// Os dados chegam pré-bucketados do server. A linha laranja é Pagos, amarela
// Reservados e azul Expirados, mesmas cores das CSS vars chart-*.

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SalesChartPoint {
  /** "HH:MM" em horário de Brasília */
  label: string;
  paid: number;
  reserved: number;
  expired: number;
}

export function SalesChart({ data }: { data: SalesChartPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="g-paid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-reserved" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-expired" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            formatter={(value) => {
              const map: Record<string, string> = {
                paid: "Pagos",
                reserved: "Reservados",
                expired: "Expirados",
              };
              return map[value] ?? value;
            }}
          />
          <Area
            type="monotone"
            dataKey="paid"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#g-paid)"
          />
          <Area
            type="monotone"
            dataKey="reserved"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#g-reserved)"
          />
          <Area
            type="monotone"
            dataKey="expired"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#g-expired)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
