import { hasAdminSession } from "@/lib/server/admin/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingPanel } from "@/components/admin/presentation";
import Link from "next/link";

export const instant = false;

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string | string[] }>;
}) {
  if (await hasAdminSession()) redirect("/admin");
  const params = await searchParams;
  return (
    <section
      className="admin-card admin-login admin-stack"
      aria-labelledby="login-heading"
    >
      <div>
        <Link
          href="/"
          prefetch={false}
          className="admin-auth-brand"
          aria-label="devup home"
        >
          devup
        </Link>
        <p className="admin-eyebrow">Private access</p>
        <h1 id="login-heading" className="mt-3">
          Welcome back.
        </h1>
        <p className="admin-description">
          Sign in to review your next edition and manage your newsletter.
        </p>
      </div>
      {params.failed === "1" && (
        <p role="alert" className="admin-warning">
          Login failed. Check your password and try again.
        </p>
      )}
      <form action="/api/admin/login" method="post" className="space-y-4">
        <label htmlFor="admin-password" className="admin-field">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          maxLength={256}
          autoComplete="current-password"
          className="admin-input"
        />
        <button type="submit" className="admin-button admin-button-primary">
          Sign in to workspace
        </button>
      </form>
      <p className="admin-help">
        Only authorized editors can access this workspace.
      </p>
      <Link href="/" prefetch={false} className="admin-link">
        Back to website <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string | string[] }>;
}) {
  return (
    <main className="admin-auth-shell">
      <Suspense fallback={<LoadingPanel>Loading login…</LoadingPanel>}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
