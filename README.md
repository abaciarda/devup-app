# Devup

**A daily tech briefing for developers, designed to be read in five minutes.**

Devup brings technology, software, and AI news together in a concise daily edition. It collects stories from developer communities, prepares summaries in English and Turkish, and publishes them on the web and by email.

The goal is simple: help developers keep up with meaningful changes without spending their morning browsing multiple feeds. Each story includes a link to its original source for readers who want more detail.

## What readers get

- **A focused daily edition.** Six main stories, with up to four additional brief updates when there is enough worthwhile news.
- **English and Turkish editions.** Both languages cover the same selected stories. Readers can choose their website language and email language separately.
- **Coverage relevant to developers.** Topics include AI, software engineering, security, developer tools, open source, and the technology industry.
- **Original sources.** Summaries link back to the underlying articles, with community discussion links where available.
- **A public archive.** The latest edition and previous issues are available on the website, alongside a language-specific RSS feed.
- **Email subscriptions.** Readers confirm their email address before receiving the newsletter and can change their language preference or unsubscribe later.

## How an edition comes together

### 1. Collect and filter stories

Devup gathers candidates from Hacker News, Lobsters, and DEV Community. It filters for recent news, removes duplicate links and similar stories, and excludes items already used in earlier editions. Source text is collected to give the summarization process supporting material beyond a headline.

### 2. Prepare both language editions

Google Gemini helps select stories and write English and Turkish summaries. Generated drafts are checked for structure, consistent story selection across languages, valid source references, and supporting excerpts from the collected material. An edition that lacks enough suitable stories or fails validation is flagged for attention.

### 3. Review and publish

The protected admin workspace provides issue previews, source controls, manual preparation, publication actions, and delivery information. The publishing workflow supports manual approval as well as scheduled automatic publication when enabled. Published editions become available on the website and in the archive.

### 4. Deliver and monitor

Resend handles newsletter and confirmation emails. Devup tracks delivery attempts, processes delivery events, and handles retries, bounces, and complaints. Scheduled operations coordinate preparation and sending, while health checks help identify editions or deliveries that need attention.

## What this repository contains

This repository includes the reader-facing website and the newsletter backend: source collection, bilingual draft generation, editorial tools, subscriptions, email templates, delivery tracking, and scheduled operations.

| Area | Responsibility |
| --- | --- |
| `app/` | Public pages, localized routes, admin pages, and API endpoints |
| `components/` | Reading experience, navigation, subscription forms, and admin interface |
| `lib/server/sources/` | Source adapters, article retrieval, filtering, and candidate selection |
| `lib/server/issues/` | Draft generation, validation, publication, and issue queries |
| `lib/server/subscriptions/` | Subscription confirmation, preferences, and unsubscribe flows |
| `lib/server/delivery/` | Email sending, retries, delivery records, and provider webhooks |
| `lib/server/operations/` | Scheduled workflows, health checks, and cleanup |
| `emails/` | Newsletter and confirmation email templates |
| `prisma/` | Database schema, migrations, and source seed data |
| `workers/newsletter-scheduler/` | Cloudflare Worker that triggers scheduled newsletter operations |
| `scripts/` | Validation, maintenance, and operational utilities |

## Technology

- **Website and server:** Next.js App Router, React, and TypeScript.
- **Styling:** Tailwind CSS and custom CSS.
- **Database:** PostgreSQL with Prisma ORM.
- **Draft generation:** Google Gemini with Zod validation.
- **Email:** React Email templates, Resend delivery, and Svix webhook verification.
- **Scheduling:** A Cloudflare Worker that calls the application's scheduled-operation endpoints.
