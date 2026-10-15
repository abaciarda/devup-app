"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNavigation() {
  const pathname = usePathname();
  const items = [
    {
      href: "/admin",
      label: "Overview",
      path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
      active: pathname === "/admin" || pathname.startsWith("/admin/issues/"),
    },
    {
      href: "/admin/operations",
      label: "Operations",
      path: "M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M10 17v4",
      active: pathname === "/admin/operations",
    },
  ];
  return (
    <nav aria-label="Admin navigation" className="admin-nav">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          aria-current={item.active ? "page" : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={item.path} />
          </svg>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
