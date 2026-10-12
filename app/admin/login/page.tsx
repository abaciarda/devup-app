import { hasAdminSession } from "@/lib/server/admin-auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const instant = false;

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string | string[] }>;
}) {
  if (await hasAdminSession()) redirect("/admin");
  const params = await searchParams;
  return (
    <section className="max-w-sm space-y-5">
      <h1 className="text-2xl font-semibold">Admin login</h1>
      {params.failed === "1" && (
        <p role="alert" className="text-sm">
          Login failed. Check your password and try again.
        </p>
      )}
      <form action="/api/admin/login" method="post" className="space-y-4">
        <label htmlFor="admin-password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          maxLength={256}
          autoComplete="current-password"
          className="w-full rounded-lg border border-line px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-ink px-5 py-2 text-white"
        >
          Log in
        </button>
      </form>
    </section>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p>Loading login…</p>}>
      <LoginForm searchParams={searchParams} />
    </Suspense>
  );
}
