import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import AdminNavigation from "@/components/admin/navigation";
import { requireAdmin } from "@/lib/server/admin/auth";
import { LoadingPanel } from "@/components/admin/presentation";

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <>
      <a href="#admin-content" className="admin-skip">
        Skip to workspace
      </a>
      <aside className="admin-sidebar">
        <Link
          href="/admin"
          prefetch={false}
          className="admin-brand"
          aria-label="devup editorial workspace"
        >
          devup<span>Editorial</span>
        </Link>
        <p className="admin-nav-label">Workspace</p>
        <Suspense
          fallback={
            <nav aria-label="Admin navigation" className="admin-nav">
              <Link href="/admin" prefetch={false}>
                Overview
              </Link>
              <Link href="/admin/operations" prefetch={false}>
                Operations
              </Link>
            </nav>
          }
        >
          <AdminNavigation />
        </Suspense>
        <div className="admin-sidebar-footer">
          <span className="admin-private-dot" />
          Private workspace<p>Technology, thoughtfully curated.</p>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>Newsletter studio</span>
          <Link href="/" prefetch={false}>
            View website <span aria-hidden="true">↗</span>
          </Link>
        </header>
        <main id="admin-content" className="admin-content">
          {children}
        </main>
      </div>
    </>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="admin-auth-shell">
          <LoadingPanel>Loading private workspace…</LoadingPanel>
        </main>
      }
    >
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
