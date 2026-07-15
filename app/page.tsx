export default function Home() {
  const kpiCards = [
    { label: "Greenhouse Temp", value: "24.6 C", change: "+0.8 today" },
    { label: "Humidity", value: "61%", change: "-2% today" },
    { label: "Soil Moisture", value: "43%", change: "+5% after irrigation" },
    { label: "Water Tank", value: "78%", change: "Stable" },
  ];

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
              <p className="font-semibold text-emerald-700">Connected</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-slate-500">Alerts</p>
              <p className="font-semibold text-amber-700">2 Warnings</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <article
              key={card.label}
              className="rounded-2xl border border-white/60 bg-white/75 p-5 shadow-[0_14px_30px_-22px_rgba(15,23,42,.8)] backdrop-blur-sm"
            >
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {card.value}
              </p>
              <p className="mt-2 text-sm text-slate-600">{card.change}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Sensor Stream</h2>
            <p className="mt-1 text-sm text-slate-600">
              Hook this panel to Recharts for live telemetry trends.
            </p>
            <div className="mt-6 h-52 rounded-2xl border border-dashed border-slate-300 bg-[linear-gradient(180deg,rgba(255,255,255,.8),rgba(221,242,232,.6))]" />
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Quick Controls</h2>
            <p className="mt-1 text-sm text-slate-600">
              Wire these to MQTT topics in lib/mqtt.ts.
            </p>
            <div className="mt-6 grid gap-3">
              <button className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700">
                Toggle Grow Lights
              </button>
              <button className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500">
                Start Irrigation (Zone A)
              </button>
              <button className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-400">
                Ventilation Boost
              </button>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
