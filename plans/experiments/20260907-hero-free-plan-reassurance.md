# Homepage free-plan reassurance

[PostHog experiment 461619](https://us.posthog.com/project/264803/experiments/461619)
Flag: `marketing-hero-free-plan-reassurance` (869655).

## Hypothesis and audience

Clarifying cost beside the hero CTA increases installer requests. Randomize
eligible visitors 50/50 by PostHog distinct ID with experience continuity enabled.
Eligible visitors are Mac users on the production marketing hostname who have not
opted out of analytics and see the reassurance area while the document is visible.
Mobile and unsupported homepage download paths are excluded. Project test-account
filters exclude known internal users from analysis; anonymous employees cannot
reliably be recognized.

Control hides the reassurance; test shows “Free plan available · No credit card
required” in the visitor's language, positioned in the existing gap below the
CTAs. Control preserves the shipped layout exactly; the test adds only this copy.
The headline, buttons, product demo and customer logos keep their existing styling
and behavior. Assignment freezes per
mount, flags are read without exposure, and the rendered arm emits the standard
PostHog exposure event once it is fully in view. Missing/disabled flags and opted-out
visitors see control without enrollment.

## Metrics and decision

- Primary: unique exposed visitors emitting `download_started` within 24 hours.
  This measures an installer request, not completed transfer or installation.
  Automatic requests emit when the redirect executes; the manual installer button
  also emits it. The funnel deduplicates repeated attempts per participant.
- Secondary: `download_clicked`, and `download_clicked` with `source=hero`, each
  within 24 hours. Header/hero/footer source and platform are now attached to clicks.
- Baseline proxy: in the 15 days before 2026-09-07, 6,641 Mac homepage visitors and
  1,663 subsequent download starts within 24 hours (25.04%). Historical event
  timing differs, so compare against the concurrent control, not this baseline.
- Target 10,000 exposed visitors, at least 14 full days, maximum 35 days. Rough
  sizing for 25% → 27.5% (+10% relative) uses 80% power / 5% two-sided significance.
  The viewport/consent-qualified sample will be smaller than the ~443 visitors/day
  baseline, so the result may remain inconclusive at 35 days.
- At the planned readout, require >=95% Bayesian probability of improvement on
  the primary metric. Otherwise retain control or report inconclusive. Secondary
  CTR alone cannot select a winner. Monitor sample-ratio mismatch and exposure
  integrity during the run; do not stop early on a favorable estimate.

## Verification and operation

On localhost or a Vercel deployment URL, use `?hero-reassurance-preview=control`
or `?hero-reassurance-preview=test`. These overrides emit no exposure and are
ignored on the production marketing hostname. Verify matching geometry, visible
copy only in test, and square CTAs. Unit tests cover flag failures, opt-out,
unmount, frozen assignment, and exactly-once exposure after rendering.

Deploy the code before launching in PostHog. Keep the 50/50 allocation unchanged
through the experiment. Switching off the flag stops new enrollment; an already
open page retains its assignment until the next navigation. Existing deployments
without the flag consumer cannot generate exposure.

Readout query/configuration and experiment description live in PostHog. The flag
is the rollback switch; remove the component after deciding the experiment.
