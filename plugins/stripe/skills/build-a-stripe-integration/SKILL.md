---
name: build-a-stripe-integration
description: Write Stripe code against what the API does today — plan the product shape, confirm every parameter from Stripe's own docs and schemas, and keep the agent in a sandbox. Use when adding checkout, billing, subscriptions, invoicing, or webhooks to a codebase, or when debugging Stripe integration code that compiles but behaves wrong.
argument-hint: what the integration has to do (take a payment, bill monthly, invoice a customer)
allowed-tools: mcp__stripe__stripe_implementation_planner, mcp__stripe__search_stripe_documentation, mcp__stripe__stripe_api_search, mcp__stripe__stripe_api_details, mcp__stripe__stripe_api_read, mcp__stripe__get_stripe_account_info
---

# Confirm the API, do not recall it

Stripe's API is large, versioned, and still moving. Model memory of it is a
snapshot of whatever was true at training time, and the failure mode is not a
compile error: it is a field that is accepted and quietly ignored. Every
parameter you write should have come from a tool call in this session.

## 1. Pick the product before the endpoint

Run `stripe_implementation_planner` with what the integration has to do. The
first decision is which Stripe product owns the flow, and it is hard to reverse:

- A one-off payment with a page Stripe hosts is Checkout.
- A one-off payment inside your own UI is either embedded Checkout or
  PaymentIntents with Elements. Pick on how much of the checkout behavior you
  want Stripe to own, not on where the form renders; staying inside your UI does
  not oblige you to build the flow yourself.
- Anything recurring is Billing, with prices and subscriptions, not a payment
  you re-run on a timer.
- Charging after the fact with terms is Invoicing.

Writing a custom recurring charge loop on top of PaymentIntents is the common
wrong turn, and it costs retries, proration, tax, and the customer portal.

## 2. Read the current docs, then cite them

`search_stripe_documentation` before you write the first line, and link what you
used. If a doc disagrees with what you expected, the doc is right. Watch for
guidance that changed: the parameter that moved, the field that is now a nested
object, the method that is superseded.

## 3. Get parameters from the schema, never from memory

`stripe_api_search` finds the method, `stripe_api_details` gives its real
parameters and types. Do this even for calls you are sure of.

A misspelled parameter is usually the easy case: Stripe answers a name it does
not recognize with an `invalid_request_error` naming the field, so you normally
find out at once. Normally, not always, because what an endpoint accepts is the
endpoint's business and the docs promise no blanket rule. The expensive case is
a parameter that is real but wrong here, and
it has three shapes. A field that belongs to a sibling endpoint. A field nested
at the wrong level, where Stripe sees the flat name as unknown and the value you
meant never arrives. And a field that is accepted and does something other than
what its name suggests, which no error can catch for you. The schema is what
separates the three.

## 4. Stay in a sandbox

Create nothing in live mode while building. Use a sandbox account and test
cards. For anything time-based, such as a trial ending or a renewal, create a
test clock and move it, instead of waiting or faking dates in your own code.
Test clocks are the only honest way to prove renewal logic works.

## 5. Make webhooks the source of truth

A browser returning from Checkout proves the browser came back, nothing more.
Fulfilment, entitlement, and subscription state belong to webhook events.
Verify the signature, respond quickly, and make the handler idempotent: Stripe
retries, and events can arrive out of order. An integration that grants access on
a redirect is an integration that grants access to anyone who can replay a URL.

## 6. Keep keys out of the code

Secret keys live in the environment, never in a repo, a client bundle, or a log
line. When adding a new call path, read how the codebase already talks to Stripe
and extend that path rather than opening a second one with its own key handling.

## Anti-patterns

- **Recalling a parameter list.** Confirm it. A wrong name errors loudly; a
  wrong nesting or the right name from the wrong endpoint does not.
- **Rolling your own recurring billing.** Proration, tax, dunning, and the
  portal are the product you are skipping.
- **Trusting the redirect.** The webhook is the event; the redirect is a hint.
- **Storing card data.** Hand it to Stripe and keep its reference. For a payment
  you will make again later that reference is a PaymentMethod saved on a
  Customer, set up with a SetupIntent or `setup_future_usage`, not a Token: a
  Token is single use, so reusing one fails on the second charge. Taking card
  data yourself changes your compliance scope.
- **Amounts as floats.** Stripe takes integers in the smallest currency unit,
  and currencies with no minor unit break a hardcoded divide by 100.
