import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Private admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="border-b border-line pb-6">
        <p className="text-sm text-muted">devup · private workspace</p>
        <Link href="/admin" prefetch={false} className="text-2xl font-semibold">
          Editorial review
        </Link>
      </header>
      {children}
    </main>
  );
}
