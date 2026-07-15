import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_16%,#d7f5d1_0%,#f3fbea_30%,#f6efe3_64%,#e8f4f7_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(24,77,46,.08),rgba(227,126,53,.08),rgba(36,112,138,.08))]" />

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12 md:px-10">
        <header className="flex items-center justify-between rounded-3xl border border-white/60 bg-white/70 p-5 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            TinFields
          </p>
          <div className="flex items-center gap-3">
            <Show when="signed-in">
              <UserButton />
              <Link
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                href="/dashboard"
              >
                Open Dashboard
              </Link>
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  type="button"
                >
                  Sign In
                </button>
              </SignInButton>
            </Show>
          </div>
        </header>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-8 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:p-10">
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
            Autonomous Vertical Farm Operations
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600 md:text-lg">
            Secure control center for multi-zone telemetry, command safety, crop
            lifecycle tracking, and historical yield intelligence.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                  type="button"
                >
                  Login to Continue
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
                href="/dashboard"
              >
                Go to Dashboard
              </Link>
            </Show>
            <a
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
              href="https://tinfields.vercel.app"
              rel="noreferrer"
              target="_blank"
            >
              Live Deployment
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
