import { readAdminDelivery } from "@/lib/server/admin/delivery";
import { deliveryEnv } from "@/lib/server/delivery/env";
import { Badge, Stat } from "./presentation";

export default async function DeliveryPanel() {
  const data = await readAdminDelivery();
  let sendingEnabled = false;
  try {
    sendingEnabled = deliveryEnv().EMAIL_DELIVERY_ENABLED === "true";
  } catch {
    sendingEnabled = false;
  }
  const confirmed =
    data.subscribers.find((row) => row.status === "confirmed")?._count._all ??
    0;
  const issueSends = data.sends.reduce(
    (total, row) => total + row._count._all,
    0,
  );
  const confirmationSends = data.confirmations.reduce(
    (total, row) => total + row._count._all,
    0,
  );
  const rows = [
    ...data.unresolved.map((row) => ({
      kind: "issue" as const,
      id: row.id,
      status: row.status,
      attempts: row.attempts,
      needsReview: row.needsReview,
      retryable: row.retryable,
      nextAttemptAt: row.nextAttemptAt,
      error: row.lastError,
      providerId: row.providerId,
    })),
    ...data.confirmationReview.map((row) => ({
      kind: "confirmation" as const,
      id: row.id,
      status: row.confirmationStatus,
      attempts: row.confirmationAttempts,
      needsReview: row.confirmationNeedsReview,
      retryable: row.confirmationRetryable,
      nextAttemptAt: row.confirmationNextAttemptAt,
      error: row.confirmationError,
      providerId: row.confirmationProviderId,
    })),
  ];
  return (
    <section className="admin-card" aria-labelledby="delivery-heading">
      <div className="admin-card-header">
        <div>
          <h2 id="delivery-heading">Email delivery</h2>
          <p>Subscribers, send activity, and provider outcomes.</p>
        </div>
        <Badge tone={sendingEnabled ? "success" : "warning"}>
          {sendingEnabled ? "Sending enabled" : "Sending paused"}
        </Badge>
      </div>
      <div className="admin-card-body admin-stack">
        <div className="admin-stats">
          <Stat
            label="Subscribers"
            value={confirmed}
            detail="Confirmed readers"
          />
          <Stat
            label="Issue sends"
            value={issueSends}
            detail="All send statuses"
          />
          <Stat
            label="Confirmations"
            value={confirmationSends}
            detail="Subscriber send statuses"
          />
        </div>
        <div className="admin-inline-stats">
          <span>
            <strong>{data.events.delivered}</strong> delivered
          </span>
          <span>
            <strong>{data.events.bounced}</strong> bounced
          </span>
          <span>
            <strong>{data.events.complained}</strong> complained
          </span>
        </div>
        {!sendingEnabled && (
          <p className="admin-warning">
            Sending is paused. Configure Resend and enable email delivery before
            sending confirmations or editions.
          </p>
        )}
        <div className="admin-actions">
          {(["confirmations", "retry"] as const).map((mode) => (
            <form key={mode} action="/api/admin/delivery" method="post">
              <input type="hidden" name="mode" value={mode} />
              <button className="admin-button" type="submit">
                {mode === "confirmations"
                  ? "Send pending confirmations"
                  : "Resume eligible deliveries"}
              </button>
            </form>
          ))}
        </div>
        <p className="admin-help">
          Each run handles up to ten attempts. Provider acceptance and inbox
          delivery are tracked separately.
        </p>
        <details className="admin-details">
          <summary>Subscriber & send breakdown</summary>
          <p className="admin-help">
            Subscribers:{" "}
            {data.subscribers
              .map((row) => `${row.status}: ${row._count._all}`)
              .join(" · ") || "none"}
          </p>
          <p className="admin-help">
            Issue sends:{" "}
            {data.sends
              .map((row) => `${row.status}: ${row._count._all}`)
              .join(" · ") || "none"}
          </p>
          <p className="admin-help">
            Confirmation sends:{" "}
            {data.confirmations
              .map((row) => `${row.confirmationStatus}: ${row._count._all}`)
              .join(" · ") || "none"}
          </p>
          <p className="admin-help">
            Provider event counts can overlap when events arrive out of order.
            Confirmation counts describe current subscriber send status, rather
            than the full attempt history.
          </p>
        </details>
        {rows.length === 0 ? (
          <div className="admin-empty">
            <strong>No delivery issues to review.</strong>Failures and uncertain
            outcomes will appear here.
          </div>
        ) : (
          <p className="admin-help">
            Locate the matching email in Resend and enter its provider ID to
            verify the outcome. Automatic retries keep the original message and
            key.
          </p>
        )}
        <ul className="space-y-4">
          {rows.map((row) => (
            <li
              key={`${row.kind}/${row.id}`}
              className="space-y-2 border-t border-line pt-4"
            >
              <p className="break-all text-sm">
                {row.kind} {row.id} · {row.status} · {row.attempts} attempts ·{" "}
                {row.needsReview
                  ? "Needs review"
                  : row.retryable
                    ? "Retry scheduled"
                    : "No automatic retry"}
              </p>
              <p className="admin-help">
                {row.error ?? "No error"}
                {row.nextAttemptAt
                  ? ` · Next attempt ${row.nextAttemptAt.toISOString()}`
                  : ""}
              </p>
              <form
                action="/api/admin/delivery"
                method="post"
                className="flex flex-wrap items-center gap-3"
              >
                <input type="hidden" name="mode" value="reconcile" />
                <input type="hidden" name="kind" value={row.kind} />
                <input type="hidden" name="id" value={row.id} />
                <label className="admin-field min-w-0 flex-1">
                  Resend email ID{" "}
                  <input
                    name="providerId"
                    required
                    defaultValue={row.providerId ?? ""}
                    className="admin-input"
                  />
                </label>
                <button type="submit" className="admin-button">
                  Verify provider outcome
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
