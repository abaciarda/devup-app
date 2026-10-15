import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "blue";
}) {
  return (
    <span className="admin-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="admin-description">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="admin-stat">
      <p>{label}</p>
      <strong>{value.toLocaleString("en-US")}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function LoadingPanel({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="admin-loading">
      <span className="admin-loading-dot" />
      {children}
    </div>
  );
}

export function formatAdminDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
}
