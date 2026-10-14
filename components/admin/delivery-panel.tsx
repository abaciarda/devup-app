import { readAdminDelivery } from "@/lib/server/admin-delivery";

export default async function DeliveryPanel() {
  const data = await readAdminDelivery();
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
    <section className="space-y-4 rounded-xl border border-line p-5">
      <h2 className="text-xl font-semibold">Email delivery</h2>
      <p>
        Sending is disabled until you configure Resend and enable
        EMAIL_DELIVERY_ENABLED. Each run handles at most ten attempts. Accepted
        means provider acceptance; delivery is tracked separately.
      </p>
      <p>
        Subscribers:{" "}
        {data.subscribers
          .map((row) => `${row.status}: ${row._count._all}`)
          .join(" · ") || "none"}
      </p>
      <p>
        Issue sends:{" "}
        {data.sends
          .map((row) => `${row.status}: ${row._count._all}`)
          .join(" · ") || "none"}
      </p>
      <p>
        Confirmation sends:{" "}
        {data.confirmations
          .map((row) => `${row.confirmationStatus}: ${row._count._all}`)
          .join(" · ") || "none"}
      </p>
      <p>
        Provider events: delivered {data.events.delivered} · bounced{" "}
        {data.events.bounced} · complained {data.events.complained}. Counts can
        overlap when events arrive out of order.
      </p>
      <div className="flex flex-wrap gap-3">
        {(["confirmations", "retry"] as const).map((mode) => (
          <form key={mode} action="/api/admin/delivery" method="post">
            <input type="hidden" name="mode" value={mode} />
            <button
              className="rounded-lg border border-line px-4 py-2"
              type="submit"
            >
              {mode === "confirmations"
                ? "Send pending confirmations"
                : "Resume eligible deliveries"}
            </button>
          </form>
        ))}
      </div>
      <p className="text-sm">
        Recent failures and unknown outcomes appear below. Automatic retries
        keep the original message and key. For review, locate the matching email
        in Resend and supply its provider ID; reconciliation verifies it before
        updating state.
      </p>
      <ul className="space-y-4">
        {rows.map((row) => (
          <li
            key={`${row.kind}/${row.id}`}
            className="space-y-2 border-t border-line pt-4"
          >
            <p className="break-all">
              {row.kind} {row.id} · {row.status} · {row.attempts} attempts ·{" "}
              {row.needsReview
                ? "Needs review"
                : row.retryable
                  ? "Retry scheduled"
                  : "No automatic retry"}
            </p>
            <p>
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
              <label>
                Resend email ID{" "}
                <input
                  name="providerId"
                  required
                  defaultValue={row.providerId ?? ""}
                  className="rounded-lg border border-line px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-line px-4 py-2"
              >
                Verify provider outcome
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
