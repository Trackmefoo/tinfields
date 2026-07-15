import type { SensorData } from "@/types";

interface SensorCardProps {
  title: string;
  sensor?: SensorData;
}

export function SensorCard({ title, sensor }: SensorCardProps) {
  return (
    <article className="rounded-2xl border border-white/60 bg-white/75 p-5 shadow-[0_14px_30px_-22px_rgba(15,23,42,.8)] backdrop-blur-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">
        {sensor ? `${sensor.value.toFixed(1)} ${sensor.unit}` : "--"}
      </p>
      <p className="mt-2 text-sm text-slate-600">
        {sensor ? `Updated ${new Date(sensor.timestamp).toLocaleTimeString()}` : "Waiting for data"}
      </p>
    </article>
  );
}
