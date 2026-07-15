"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorHistoryPoint } from "@/types";

interface SensorStreamChartProps {
  data: SensorHistoryPoint[];
}

export function SensorStreamChart({ data }: SensorStreamChartProps) {
  return (
    <div className="mt-6 h-60 rounded-2xl border border-white/70 bg-white/80 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d7e4dc" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#334155" }} />
          <YAxis tick={{ fontSize: 11, fill: "#334155" }} width={36} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #d1e3d5" }}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            name="Temp"
            stroke="#0f766e"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="humidity"
            name="Humidity"
            stroke="#1d4ed8"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="soilMoisture"
            name="Soil"
            stroke="#65a30d"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="ph"
            name="pH"
            stroke="#ea580c"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
