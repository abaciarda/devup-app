"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function ApplicationChrome({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <>
      {!isAdmin && header}
      {children}
      {!isAdmin && footer}
    </>
  );
}
