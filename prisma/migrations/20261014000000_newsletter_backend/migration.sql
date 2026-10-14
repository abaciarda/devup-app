CREATE TYPE "GenerationStatus" AS ENUM ('draft', 'ready', 'failed');

CREATE TYPE "EmailLanguage" AS ENUM ('en', 'tr');

CREATE TYPE "SubscriberStatus" AS ENUM ('pending', 'confirmed', 'unsubscribed', 'suppressed');

CREATE TYPE "SendStatus" AS ENUM ('pending', 'accepted', 'failed', 'unknown', 'suppressed');

CREATE TABLE "RawItem" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usedIssueId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Issue" (
    "id" SERIAL NOT NULL,
    "editionDate" DATE NOT NULL,
    "generationStatus" "GenerationStatus" NOT NULL DEFAULT 'draft',
    "content" JSONB,
    "generationModel" TEXT,
    "generationUsage" JSONB,
    "generationError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "deliveryStartedAt" TIMESTAMP(3),
    "deliveryFinishedAt" TIMESTAMP(3),
    "scheduledGenerationAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "language" "EmailLanguage" NOT NULL,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'pending',
    "subscriptionVersion" INTEGER NOT NULL DEFAULT 1,
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "consentVersion" VARCHAR(100) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "unsubscribedAt" TIMESTAMPTZ(3),
    "suppressedAt" TIMESTAMPTZ(3),
    "suppressionReason" VARCHAR(100),
    "confirmationTokenHash" VARCHAR(64),
    "confirmationIssuedAt" TIMESTAMPTZ(3),
    "confirmationExpiresAt" TIMESTAMPTZ(3),
    "confirmationSendId" TEXT,
    "confirmationPayload" JSONB,
    "confirmationIdempotencyKey" VARCHAR(256),
    "confirmationStatus" "SendStatus",
    "confirmationAttempts" INTEGER NOT NULL DEFAULT 0,
    "confirmationRetryable" BOOLEAN NOT NULL DEFAULT false,
    "confirmationNeedsReview" BOOLEAN NOT NULL DEFAULT false,
    "confirmationFirstAttemptAt" TIMESTAMPTZ(3),
    "confirmationLastAttemptAt" TIMESTAMPTZ(3),
    "confirmationNextAttemptAt" TIMESTAMPTZ(3),
    "confirmationProviderId" TEXT,
    "confirmationAcceptedAt" TIMESTAMPTZ(3),
    "confirmationDeliveredAt" TIMESTAMPTZ(3),
    "confirmationBouncedAt" TIMESTAMPTZ(3),
    "confirmationComplainedAt" TIMESTAMPTZ(3),
    "confirmationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SendLog" (
    "id" TEXT NOT NULL,
    "issueId" INTEGER NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "subscriptionVersion" INTEGER NOT NULL,
    "language" "EmailLanguage" NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" VARCHAR(256) NOT NULL,
    "status" "SendStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "firstAttemptAt" TIMESTAMPTZ(3),
    "lastAttemptAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "providerId" TEXT,
    "acceptedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "bouncedAt" TIMESTAMPTZ(3),
    "complainedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConfirmationSend" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "firstAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "providerId" TEXT,
    "acceptedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "bouncedAt" TIMESTAMPTZ(3),
    "complainedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConfirmationSend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "CleanupRun" (
    "date" DATE NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "counts" JSONB,

    CONSTRAINT "CleanupRun_pkey" PRIMARY KEY ("date")
);

CREATE TABLE "PipelineLease" (
    "key" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PipelineLease_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RawItem_normalizedUrl_idx" ON "RawItem"("normalizedUrl");

CREATE INDEX "RawItem_usedIssueId_publishedAt_idx" ON "RawItem"("usedIssueId", "publishedAt");

CREATE UNIQUE INDEX "RawItem_sourceId_externalId_key" ON "RawItem"("sourceId", "externalId");

CREATE UNIQUE INDEX "Issue_editionDate_key" ON "Issue"("editionDate");

CREATE INDEX "Issue_publishedAt_editionDate_idx" ON "Issue"("publishedAt", "editionDate");

CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

CREATE UNIQUE INDEX "Subscriber_confirmationTokenHash_key" ON "Subscriber"("confirmationTokenHash");

CREATE UNIQUE INDEX "Subscriber_confirmationSendId_key" ON "Subscriber"("confirmationSendId");

CREATE UNIQUE INDEX "Subscriber_confirmationIdempotencyKey_key" ON "Subscriber"("confirmationIdempotencyKey");

CREATE UNIQUE INDEX "Subscriber_confirmationProviderId_key" ON "Subscriber"("confirmationProviderId");

CREATE INDEX "Subscriber_status_id_idx" ON "Subscriber"("status", "id");

CREATE INDEX "Subscriber_status_confirmationExpiresAt_idx" ON "Subscriber"("status", "confirmationExpiresAt");

CREATE INDEX "Subscriber_confirmationStatus_confirmationNextAttemptAt_idx" ON "Subscriber"("confirmationStatus", "confirmationNextAttemptAt");

CREATE UNIQUE INDEX "SendLog_idempotencyKey_key" ON "SendLog"("idempotencyKey");

CREATE UNIQUE INDEX "SendLog_providerId_key" ON "SendLog"("providerId");

CREATE INDEX "SendLog_issueId_status_nextAttemptAt_idx" ON "SendLog"("issueId", "status", "nextAttemptAt");

CREATE INDEX "SendLog_status_nextAttemptAt_idx" ON "SendLog"("status", "nextAttemptAt");

CREATE INDEX "SendLog_subscriberId_idx" ON "SendLog"("subscriberId");

CREATE UNIQUE INDEX "SendLog_issueId_subscriberId_key" ON "SendLog"("issueId", "subscriberId");

CREATE UNIQUE INDEX "ConfirmationSend_providerId_key" ON "ConfirmationSend"("providerId");

CREATE INDEX "ConfirmationSend_subscriberId_idx" ON "ConfirmationSend"("subscriberId");

CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

ALTER TABLE "RawItem" ADD CONSTRAINT "RawItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RawItem" ADD CONSTRAINT "RawItem_usedIssueId_fkey" FOREIGN KEY ("usedIssueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SendLog" ADD CONSTRAINT "SendLog_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SendLog" ADD CONSTRAINT "SendLog_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConfirmationSend" ADD CONSTRAINT "ConfirmationSend_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
