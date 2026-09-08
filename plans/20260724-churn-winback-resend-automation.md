# Churn win-back — Resend Automation spec

Evergreen win-back flow: `subscription.canceled` Resend event → 7-day delay → founder-style win-back email. This doc describes the automation to click together in the Resend dashboard once the event emission ships. Nothing has been created in Resend yet.

## Pieces and where they live

| Piece | Where | Status |
| --- | --- | --- |
| Event emission | `packages/auth/src/lib/lifecycle.ts` (`emitLifecycleEvent`) + Stripe cancel handler in `packages/auth/src/server.ts` | On branch `churn-user-reactivation`, lands with that PR — do not duplicate |
| Email template | `packages/email/src/emails/churn-winback.tsx` | This branch |
| Automation | Resend dashboard | Not created — build only after the `churn-user-reactivation` PR is deployed to prod, otherwise the trigger event never fires |

## Trigger event

Emitted once per organization owner when a Stripe subscription is canceled:

```json
{
	"name": "subscription.canceled",
	"email": "<owner email>",
	"payload": {
		"organizationId": "…",
		"organizationName": "…",
		"plan": "…",
		"ownerName": "…"
	}
}
```

Note: multi-owner orgs emit one event per owner, so each owner independently enters the automation and gets their own email. That is intended (each owner can resubscribe).

## Template

`churn-winback.tsx` is written so its rendered output is paste-ready for Resend: the default prop values are the Resend placeholder strings, so `bun run export` (in `packages/email`, output in `out/churn-winback.html`) produces HTML containing the placeholders verbatim. No manual substitution.

Placeholder → payload mapping:

| Placeholder in HTML | Payload key | Fallback |
| --- | --- | --- |
| `{{{ownerName\|there}}}` | `ownerName` | "there" |
| `{{{organizationName\|your team}}}` | `organizationName` | "your team" |
| `{{{plan\|paid}}}` | `plan` (payload key is `plan`, not `planName` — the React prop name differs) | "paid" |
| `{{{RESEND_UNSUBSCRIBE_URL}}}` | built-in Resend variable | — |

The email is deliberately plain: no logo, no button, no card layout. Founder voice, one CTA link (`https://app.superset.sh/settings/billing`), and a reply prompt as the second ask.

## Automation config (click together in Resend)

1. **Trigger**: Event received — `subscription.canceled`.
2. **Delay**: Wait 7 days.
3. **Send email**:
   - Template: paste exported `churn-winback.html` as a new Resend template named `churn-winback`. Record the template id here after creation: `TBD`.
   - Subject: `One question before you go`
   - From: `Satya from Superset <satya@superset.sh>` — not `noreply@superset.sh`; the email asks people to hit reply, so the from address must accept replies.
   - Reply-to: `satya@superset.sh`
4. **Exit conditions**:
   - Contact unsubscribed → exit (Resend handles this via the audience; the template includes `{{{RESEND_UNSUBSCRIBE_URL}}}`).
   - Resubscribed before day 7 → should exit, but no `subscription.resubscribed` / `subscription.started` Resend event is emitted today, so this exit cannot be configured yet. Known gap: an owner who resubscribes within the 7-day window still gets the email. Follow-up: emit a resubscribe lifecycle event from the Stripe subscription-created/updated handler and add it as an exit rule.

## Prerequisites to verify before enabling

- The `churn-user-reactivation` PR is deployed to prod (events actually fire).
- Canceled owners exist as contacts in the Resend audience — `{{{RESEND_UNSUBSCRIBE_URL}}}` only resolves for audience contacts. If `events/send` does not auto-create the contact, add a contact-upsert step to the emission path before enabling.

## Testing

1. Fire a synthetic event at your own address:

   ```bash
   curl -X POST https://api.resend.com/events/send \
   	-H "Authorization: Bearer $RESEND_API_KEY" \
   	-H "Content-Type: application/json" \
   	-d '{"name":"subscription.canceled","email":"satya@superset.sh","payload":{"organizationId":"test","organizationName":"Test Org","plan":"Pro","ownerName":"Satya"}}'
   ```

2. Temporarily set the delay to 5 minutes, confirm delivery, placeholder substitution, fallbacks (send a second event with an empty payload), and the unsubscribe link.
3. Set the delay back to 7 days before enabling.
