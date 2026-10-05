---
name: refund-and-dispute
description: Move money back to a customer in Stripe, or respond to a dispute, with the checks that belong in front of an irreversible write — read the charge first, fix the exact amount, and clear Stripe's human confirmation step. Use when the user asks to refund a payment, cancel and refund a subscription, or handle a chargeback or dispute.
argument-hint: the charge or payment id and what should happen to it
allowed-tools: mcp__stripe__get_stripe_account_info, mcp__stripe__stripe_api_search, mcp__stripe__stripe_api_details, mcp__stripe__stripe_api_read, mcp__stripe__stripe_api_write
---

# A refund is not a retryable call

Every other Stripe read can be run again for free. A refund cannot. Treat the
write as the last step of a short checklist, never as the first attempt at
understanding the request.

## 1. Read the charge before you touch it

The checks live on the **charge**, so a `pi_` id is not where this starts: read
the PaymentIntent, follow `latest_charge`, and read that charge. Skipping the hop
is how an agent misses an open dispute, because `refunded`, `amount_refunded`,
and `disputed` are not PaymentIntent fields and reading them off one yields
`undefined` rather than an error.

A `latest_charge` of `null` ends the job rather than starting it: the
PaymentIntent was never confirmed, or no attempt produced a charge, so there is
nothing to refund. Say that and stop.

On the charge, check four fields:

- `amount` and `currency`: the only authority for what can be refunded.
- `amount_refunded`: a charge refunded in part looks fully refundable from a
  dashboard glance.
- `status` and `refunded`: a failed or already-refunded charge needs a
  different answer, not a write.
- `disputed`: if a dispute is open, refunding is the wrong instrument. See
  step 5.

Confirm the mode with `get_stripe_account_info` first. A live-mode refund issued
because the id was assumed to be a sandbox id cannot be undone.

## 2. Fix the amount in the smallest currency unit, explicitly

Omitting `amount` refunds the whole charge. A partial refund takes an integer in
the smallest unit of the charge's currency, so a $12.34 refund is `1234` and a
1234 yen refund is `1234`. Never derive the figure from a human-readable total
in the conversation when the charge object is one read away, and say the figure
and currency back to the user before writing.

## 3. State the intent, then write once

Before calling `stripe_api_write`, tell the user in one line what you are about
to do: the charge id, the amount, the currency, the mode, and the `reason`
(`duplicate`, `fraudulent`, or `requested_by_customer`). The reason is not
decoration; `fraudulent` affects how Stripe treats the customer later, so do not
pick it for a routine cancellation.

## 4. Expect Stripe's confirmation step and let the human do it

Stripe requires human confirmation before it performs certain writes, refunds
among them. The call comes back with a confirmation URL instead of a refund.
When that happens:

- Pass the URL to the user and stop. They review the real amount on Stripe's
  own page and approve it there.
- The approval expires after 24 hours.
- After they approve, retry the same call once. Approval alone does not perform
  the refund.

Do not loop retrying while you wait, and do not route around the step by asking
for an API key. The confirmation is the control that makes an agent with write
access safe.

If a write errors ambiguously, list the charge's refunds before retrying and
check whether one already landed. Reporting a refund that did not happen and
issuing a second one are both worse than a slow answer.

## 5. A dispute is not a refund

A chargeback is the issuer taking the money back on the customer's word. Opening
a refund on a disputed charge can cost you the amount twice and still lose the
dispute. Read the dispute, then either submit evidence through its `evidence`
fields or accept it deliberately. Say which one you did and why.

## 6. Report what actually changed

The refund id, the amount and currency, the `status` (`pending` and `succeeded`
mean different things to the customer), and the mode. Tell the user the money
typically reaches the customer in five to ten business days, because the next
question is always when it arrives.

## Anti-patterns

- **Refunding to make a dispute go away.** It does not, and it can double the
  loss.
- **"Refund the last payment."** Name the charge you picked and why, or the user
  cannot catch you picking the wrong one.
- **Guessing a partial amount from the thread.** Read the charge.
- **Running the checklist against a PaymentIntent.** The refund and dispute
  fields live on the charge; a PaymentIntent answers those questions with
  `undefined`, which reads like "no".
- **Treating a confirmation URL as an error.** It is the system working.
- **Refunding when the user asked to cancel.** Cancelling a subscription stops
  future invoices and refunds nothing. Do the one that was asked for, and say
  which.
