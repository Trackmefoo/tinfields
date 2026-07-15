"use client";

import { IrrigationPanel } from "@/components/IrrigationPanel";
import { LightControl } from "@/components/LightControl";
import { SensorCard } from "@/components/SensorCard";
import { useControl } from "@/hooks/useControl";
import { useFarmData } from "@/hooks/useFarmData";

export default function Home() {
  const { isMqttConnected, sensors } = useFarmData();
  const { startIrrigationZoneA, toggleLights, ventilationBoost } = useControl();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_16%,#d7f5d1_0%,#f3fbea_30%,#f6efe3_64%,#e8f4f7_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(24,77,46,.08),rgba(227,126,53,.08),rgba(36,112,138,.08))]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-5 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              TinFields
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              Farm Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
              Real-time greenhouse telemetry and actuator controls for lights,
              irrigation, and climate zones.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-slate-500">MQTT</p>
              <p className="font-semibold text-emerald-700">
                {isMqttConnected ? "Connected" : "Simulated"}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-slate-500">Broker</p>
              <p className="font-semibold text-amber-700">
                {process.env.NEXT_PUBLIC_MQTT_BROKER_URL ? "Configured" : "Missing"}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SensorCard title="Greenhouse Temp" sensor={sensors.temperature} />
          <SensorCard title="Humidity" sensor={sensors.humidity} />
          <SensorCard title="Soil Moisture" sensor={sensors.soilMoisture} />
          <SensorCard title="pH" sensor={sensors.ph} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Sensor Stream</h2>
            <p className="mt-1 text-sm text-slate-600">
              The stream is now wired to MQTT with a simulation fallback.
            </p>
            <div className="mt-6 h-52 rounded-2xl border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,.8),rgba(221,242,232,.6))]" />
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Quick Controls</h2>
            <p className="mt-1 text-sm text-slate-600">
              Commands publish to your MQTT control topic.
            </p>
            <div className="mt-6 grid gap-3">
              <LightControl disabled={!isMqttConnected} onToggle={toggleLights} />
              <IrrigationPanel
                disabled={!isMqttConnected}
                onStartZoneA={startIrrigationZoneA}
              />
              <button
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-300"
                disabled={!isMqttConnected}
                onClick={ventilationBoost}
                type="button"
              >
                Ventilation Boost
              </button>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
