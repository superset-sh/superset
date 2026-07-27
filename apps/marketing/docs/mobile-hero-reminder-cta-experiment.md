# Mobile hero reminder CTA experiment — PostHog setup

Code for this experiment ships behind the `mobile-hero-reminder-cta` flag
(SUPER-1625). The flag and experiment do **not** exist yet in PostHog — this
doc is the exact setup to create them. Project: **Production** (id `264803`,
us.posthog.com).

## What the code does

On mobile viewports (`Platform.Mobile` via user-agent detection), the hero's
primary CTA depends on the flag variant:

- `control` — existing Download dropdown (unchanged).
- `test` — "Remind me on desktop" button that opens an email-capture modal
  ("Send me a reminder"). Submitting fires a signup event carrying the email.

Desktop/tablet visitors always see the existing CTA regardless of variant, so
the flag can roll out to 100% of users — mobile gating happens in code.

The variant is bootstrapped synchronously at `posthog.init` (same pattern as
`landing-hero-positioning`, PR #5884): `hero-flag-bootstrap.ts` computes the
deterministic assignment locally so there is no control→test flash and the
first pageview already carries `$feature/mobile-hero-reminder-cta`.

## Experiment to create

- **Name**: Mobile hero reminder CTA
- **Feature flag key**: `mobile-hero-reminder-cta` (must match exactly —
  `MOBILE_HERO_REMINDER_FLAG` in
  `apps/marketing/src/lib/analytics/hero-flag-bootstrap.ts`)
- **Variants**: `control` / `test`, 50/50 split, in that order. The bootstrap
  mirrors variant order + split in `FLAG_VARIANTS`; if you change either,
  update that constant in the same change (drift is safe but reintroduces the
  swap-on-response flash).
- **Participants**: 100% of users, no property filters (code already gates to
  mobile). If you prefer to scope participation, filter on
  `mobile_hero_cta_impression` exposure rather than device properties.

## Metrics

All three events carry a `variant` property (`control` | `test`) plus the
automatic `$feature/mobile-hero-reminder-cta` property:

| Event | Fires when |
|---|---|
| `mobile_hero_cta_impression` | Hero renders on a mobile viewport (once per pageload, both arms) |
| `mobile_hero_cta_clicked` | Primary hero CTA tapped — reminder button (test) or Download trigger (control) |
| `mobile_hero_reminder_signup` | Reminder modal email submitted (test arm only; `email` property holds the address) |

- **Primary metric**: funnel `mobile_hero_cta_impression` →
  `mobile_hero_reminder_signup`. Control converts ~0 by construction; the
  experiment answers whether the reminder CTA captures meaningful signup
  volume without hurting `download_clicked` / `waitlist_clicked` on mobile.
- **Secondary metric**: downstream desktop activation for captured emails —
  join `mobile_hero_reminder_signup.email` against later signed-in desktop
  activity (activation campaign audience comes from this event, same
  email-on-event pattern as `waitlist_signup`).

## Launch order caveat

Until the experiment is launched, `/flags` responses do not include the flag,
so after the bootstrap value is overwritten mobile visitors settle on the
control CTA (a test-arm first paint may briefly appear for ~50% of them).
Launch the experiment at (or just before) the marketing deploy to avoid that
window, and log it in Notion → Growth → Experiment Log.
