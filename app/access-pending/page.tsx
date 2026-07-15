import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function AccessPendingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_18%,#fdf2f2_0%,#fff7ed_34%,#f8fafc_68%,#eef6ff_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(190,24,93,.06),rgba(234,88,12,.06),rgba(14,165,233,.06))]" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-6 px-6 py-12 md:px-10">
        <div className="flex items-center justify-between rounded-3xl border border-white/60 bg-white/75 p-5 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
            Approval Required
          </p>
          <UserButton />
        </div>

        <section className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:p-10">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Your account is pending approval
          </h1>
          <p className="mt-4 text-base text-slate-600 md:text-lg">
            You have authenticated successfully, but your TinFields account has not been
            approved for operational access yet. An administrator must assign an approved role
            before you can use the dashboard or protected APIs.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              href="/"
            >
              Return Home
            </Link>
            <Link
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
              href="/sign-in"
            >
              Switch Account
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}