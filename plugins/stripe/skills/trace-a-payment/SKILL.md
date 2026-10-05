---
name: trace-a-payment
description: Answer a question about money that already moved in Stripe — why a charge failed, what a customer was billed, where an invoice or payout stands — by reading the object chain instead of guessing from a dashboard total. Use when the user pastes a Stripe id, asks why a payment failed, asks what a customer is paying, or wants revenue, invoice, or subscription state.
argument-hint: the Stripe id (ch_, pi_, cus_, in_, sub_) or the question to answer
allowed-tools: mcp__stripe__get_stripe_account_info, mcp__stripe__stripe_api_search, mcp__stripe__stripe_api_details, mcp__stripe__stripe_api_read, mcp__stripe__stripe_analytics, mcp__stripe__get_balance_summary, mcp__stripe__search_stripe_documentation
---

# Read the chain, not one object

A Stripe answer is only as good as the objects it was read from. Every question
about money that already moved has an exact object chain behind it, and the
chain is short. Walk it.

## 1. Say which account and which mode you are in

Start with `get_stripe_account_info`. Live mode and a sandbox are separate
worlds that share nothing: an id created in one returns "No such charge" in the
other, which reads like a deleted record rather than a wrong environment. Name
the account and the mode in your answer so the user can tell whether you looked
where they meant.

## 2. Let the id prefix tell you what you are holding

Stripe ids are typed. `ch_` is a charge, `pi_` a PaymentIntent, `cus_` a
customer, `in_` an invoice, `sub_` a subscription, `cs_` a Checkout Session,
`re_` a refund, `dp_` a dispute, `po_` a payout, `txn_` a balance transaction.
Use `stripe_api_search` to find the right method, `stripe_api_details` to get
its real parameters, then `stripe_api_read`. Never invent a field name: the
details tool exists so you do not have to.

## 3. For a failure, read the decline, not the status

`status: "requires_payment_method"` says nothing a user can act on. The cause
lives in two places:

- The PaymentIntent's `last_payment_error`: the decline code and message.
- The charge's `outcome`: `network_status`, `reason`, `risk_level`,
  `seller_message`, which is the sentence written for you to pass on, and
  `advice_code`.

Read the retry decision off `advice_code`, not off the decline code. It has three
values and each is Stripe's advice rather than a verdict: `try_again_later` means
a retry may work, `do_not_try_again` means Stripe advises against reusing the card
for this transaction, and `confirm_card_data` means some of the submitted card
details are wrong and the customer should check them against the card. Stale
details on a stored payment method trigger that one as readily as a typo does.
The decline code answers a different question, and most of them are
vague on purpose: `do_not_honor` and `generic_decline` both mean "the issuer
declined and did not say why", so calling either permanent is a guess the advice
code already settles.

To tell an issuer decline from a payment Stripe Radar blocked before the issuer
ever saw it, read `outcome.type`: `blocked` with a `reason` such as
`highest_risk_level` is Radar. A `network_status` of `not_sent_to_network` says
only that the network never saw it, and a `risk_level` is attached to payments
Radar allowed as well, so neither one attributes the failure on its own.

## 4. Follow the chain the question actually asks about

- "Why this amount?" is invoice to subscription to price to product, plus
  `discount` and `tax` on the invoice. The number on the invoice is the end of
  a chain, not a fact in itself.
- "What did we keep?" is charge to `balance_transaction`, which carries `fee`
  and `net`. The charge amount is not revenue, and that `net` is not the end of
  it either: a refund and a dispute each create their own balance transaction,
  so a refunded charge still reports the original `net`. Net off its refunds and
  disputes before reporting a figure, and page the refund list to the end: the
  charge embeds only the first ten, so a charge refunded in many parts overstates
  what you kept until `has_more` is false.
- "Where is the money?" is `get_balance_summary` or payout to balance
  transactions, not the sum of recent charges.
- "Is this customer current?" is subscription `status` plus
  `current_period_end` plus `cancel_at_period_end`. An active subscription with
  `cancel_at_period_end: true` is a churn you would otherwise report as healthy.

## 5. Convert amounts deliberately

Stripe amounts are integers in the smallest currency unit. `amount: 2000` in
USD is $20.00, but JPY has no minor unit, so `amount: 2000` is 2000 yen, and
dividing by 100 would under-report it by a hundredfold. Read the `currency`
field, then convert. State the currency in every figure you report.

## 6. Answer with ids, mode, and the window

Quote the id of every object you read, the mode you read it in, and the time
window for anything aggregated. For a count or a rate, prefer `stripe_analytics`
over paging a list yourself: a list request defaults to 10 items and newest
first, so "I found 10 charges" is a page size, not a finding.

## Anti-patterns

- **Mixing modes.** A sandbox id in a live-mode question returns a clean,
  confident 404. Check the mode before you believe the absence.
- **Reporting the charge amount as revenue.** The fee lands on the charge's
  balance transaction; a refund or a dispute lands on its own, and neither
  rewrites the first one.
- **Trusting a list default.** Lists are paginated; an unbounded "how many"
  answered from one page is wrong without saying so.
- **Explaining a decline from `status`.** The actionable text is in
  `outcome.seller_message` and `last_payment_error`.
- **Reading one object and inferring the rest.** A subscription's price is not
  the invoice total once a coupon, proration, or tax exists.
