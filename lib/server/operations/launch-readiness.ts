import "server-only";
import { adminEnv } from "../admin/env";
import { emailEnv } from "../delivery/sender-env";
import { subscriptionEnv } from "../subscriptions/env";
import { deliveryEnv, webhookSecret } from "../delivery/env";
import { operationsEnv, isPreviewDeployment } from "./env";

export function launchReadiness() {
  const check = (read: () => unknown) => {
    try {
      read();
      return true;
    } catch {
      return false;
    }
  };
  const checks = {
    canonicalHttps: check(() => {
      if (new URL(process.env.SITE_URL ?? "").protocol !== "https:")
        throw new Error();
    }),
    adminSettings: check(adminEnv),
    senderSettings: check(emailEnv),
    subscriberLinks: check(subscriptionEnv),
    sendingCredentials: check(() => {
      const env = deliveryEnv();
      if (!env.RESEND_API_KEY) throw new Error();
    }),
    webhookSettings: check(webhookSecret),
    operationalSettings: check(operationsEnv),
    publicReviewApproved: process.env.PUBLIC_LAUNCH_APPROVED === "true",
    cleanupEnabled: process.env.CLEANUP_ENABLED === "true",
    pipelineEnabled: process.env.PIPELINE_ENABLED === "true",
    deliveryEnabled: process.env.EMAIL_DELIVERY_ENABLED === "true",
    productionDeployment:
      process.env.NODE_ENV === "production" && !isPreviewDeployment(),
  };
  return {
    configurationReady: Object.values(checks).every(Boolean),
    checks,
    liveChecksRequired: [
      "Real Turkish and English inbox delivery",
      "Public webhook delivery and unsubscribe-header DKIM coverage",
      "Operator/privacy/consent review and retention approval",
      "Separate production database and migration/restore verification",
      "Hosting and workflow quota checks",
    ],
  };
}
