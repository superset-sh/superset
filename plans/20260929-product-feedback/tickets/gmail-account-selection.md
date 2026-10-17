# [plugins] Connect the intended Gmail account when browser accounts differ

## Context

Avi reports an Access blocked error when the email attached to the Superset account differs from the default Google account in the browser. Users should be able to choose the Gmail address they intend to connect and recover clearly if authorization fails. The exact error and root cause are not yet confirmed.

## References

| Source | Who | Link | Date |
| --- | --- | --- | --- |
| Product feedback | Avi | [Notion page](https://app.notion.com/p/3eab9d5bf61680b9a6ded9e98069b80a) | 2026-09-29 |

## Implementation notes

### Files

- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginConnections/usePluginConnections.ts:13`: launches plugin connection in the system browser.
- `apps/api/src/app/api/plugins/[plugin]/connect/route.ts:24`: authenticates the browser's Superset session before authorization.
- `packages/trpc/src/router/plugins/oauth.ts:46`: builds plugin authorization URLs from manifest configuration.
- `apps/api/src/app/api/plugins/callback/[plugin]/route.ts:45`: rejects a callback when the session user differs from the signed state's user.
- `apps/api/src/app/api/integrations/google/connect/route.ts:21`: separate Google integration flow; do not assume this is the Gmail plugin's authorization path.

### Approach

Reproduce with Superset account A and browser-default Google account B, then capture the exact error screen, provider, and connect/callback path. Also vary the browser's Superset session independently from its Google account. Once the actual Gmail plugin authorization path is confirmed, offer account selection when supported, show the connected address, and provide an actionable retry with a different account. Allow the provider Gmail address to differ from the Superset login address where the integration supports it.

### Gotchas

- Provider account selection and Superset session mismatch are separate problems. Preserve the signed-state/session identity check; do not bypass it to permit a different Gmail address.
- The earlier Notion draft suggested Google's `select_account` consent parameter as a candidate. That is not a confirmed fix: a vendor-managed authorization flow, app verification restriction, Workspace administrator policy, or Superset browser session mismatch may require a different resolution.
- No first-party Gmail plugin manifest was found in the scoped repository inspection. Identify the installed plugin/provider before changing the generic Google integration.
- Verify matching accounts, different provider accounts, multiple browser accounts, a different Superset browser session, cancel/retry, and policy-blocked authorization. The PR does not resolve this bug.
