import { requireAdmin } from "@/lib/server/admin/auth";
import { getDb } from "@/lib/server/database/client";
import { launchReadiness } from "@/lib/server/operations/launch-readiness";
import Link from "next/link";
import { Badge, formatAdminDate } from "./presentation";
import ManualPreparationForm from "./manual-preparation-form";

const checkNames: Record<string, string> = {
  canonicalHttps: "Secure website URL",
  adminSettings: "Admin access",
  senderSettings: "Email sender",
  subscriberLinks: "Subscriber links",
  sendingCredentials: "Resend credentials",
  webhookSettings: "Delivery webhook",
  operationalSettings: "Operations settings",
  publicReviewApproved: "Launch approval",
  cleanupEnabled: "Data cleanup",
  pipelineEnabled: "Daily preparation",
  deliveryEnabled: "Email sending",
  productionDeployment: "Production deployment",
};

export default async function OperationsPanel() {
  await requireAdmin();
  const report = launchReadiness();
  const cleanup = await getDb().cleanupRun.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, finishedAt: true },
  });
  const configured = Object.values(report.checks).filter(Boolean).length;
  return (
    <section className="admin-card" aria-labelledby="operations-heading">
      <div className="admin-card-header">
        <div>
          <h2 id="operations-heading">Operations & launch readiness</h2>
          <p>
            A clear view of your configuration before the next edition goes out.
          </p>
        </div>
        <Badge tone={report.configurationReady ? "success" : "warning"}>
          {configured}/{Object.keys(report.checks).length} configured
        </Badge>
      </div>
      <div className="admin-card-body admin-stack">
        <ul className="admin-checks">
          {Object.entries(report.checks).map(([key, valid]) => (
            <li key={key}>
              <span>{checkNames[key] ?? key}</span>
              <Badge tone={valid ? "success" : "warning"}>
                {valid ? "Configured" : "Needs setup"}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="admin-actions">
          <ManualPreparationForm />
          <form action="/api/admin/operations" method="post">
            <input type="hidden" name="mode" value="preview_cleanup" />
            <button className="admin-button" type="submit">
              Preview cleanup counts
            </button>
          </form>
          <Link
            href="/admin/operations"
            prefetch={false}
            className="admin-link"
          >
            Review retention & cleanup <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="admin-help">
          {cleanup?.finishedAt
            ? `Last completed cleanup: ${formatAdminDate(cleanup.finishedAt)}.`
            : "No completed cleanup yet."}{" "}
          Manual preparation works at any time: it fetches news and creates
          today&apos;s private draft, or opens it if already ready. Nothing is
          published or emailed. Cleanup previews never delete data.
        </p>
        <details className="admin-details">
          <summary>About these checks</summary>
          <p className="admin-help">
            Configuration checks do not prove inbox delivery or deployment
            readiness. Public launch still requires the operator checklist.
            Automated preparation runs from 07:00–11:00, Europe/Istanbul; the
            manual button is independent of that schedule. Cleanup must be
            explicitly enabled before it can delete or redact eligible data.
          </p>
        </details>
      </div>
    </section>
  );
}
