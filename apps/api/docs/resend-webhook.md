# Resend webhook → PostHog mirroring

`POST /api/resend/webhook` receives Resend webhooks, verifies the Svix signature, and mirrors each event as a server-side PostHog capture (`email_sent`, `email_delivered`, `email_clicked`, `email_bounced`, `email_complained`, `contact_updated`). The recipient email is the PostHog `distinct_id`; props include `subject`, `resend_email_id`, and any tags set on the email (e.g. `campaign`, `step`). Bounces, complaints, and unsubscribes carry `suppress_recipient: true` so campaign sends can filter them out.

## Resend dashboard setup

1. In [Resend](https://resend.com) go to **Webhooks** → **Add Webhook**.
2. Endpoint URL: `https://<api-host>/api/resend/webhook` (production: the deployed `@superset/api` host).
3. Select the events: `email.sent`, `email.delivered`, `email.clicked`, `email.bounced`, `email.complained`, `contact.updated`.
4. Copy the webhook signing secret (`whsec_...`) and set it as `RESEND_WEBHOOK_SECRET` in the api app's environment (declared in `apps/api/src/env.ts`).

Requests with a missing or invalid Svix signature (headers `svix-id`, `svix-timestamp`, `svix-signature`; 5-minute timestamp tolerance) are rejected with 401. Unrecognized event types are acknowledged and ignored so new Resend event types don't cause retries.
