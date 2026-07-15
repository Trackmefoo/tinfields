import Link from "next/link";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
          Access Restricted
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Self-service sign-up is disabled
        </h1>
        <p className="mt-4 text-sm text-slate-600">
          TinFields access is granted by administrator approval only. If you need access,
          contact the workspace owner and ask them to provision and approve your account.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            href="/sign-in"
          >
            Go to Sign In
          </Link>
          <Link
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            href="/"
          >
            Back Home
          </Link>
        </div>
      </div>
    </main>
  );
}
