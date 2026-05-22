# SUPER-750 Deferred Follow-ups

## FU-1: Safari OAuth redirect failure (separate investigation)

**File:** `packages/cli/src/lib/auth.ts:177-198` (`buildAuthorizeUrl`)

Daniel Vega's EC2 report included a Safari-specific failure: `[query.response_type] Invalid input: expected "code"`. Static trace confirms `response_type=code` is set identically for both `pasteAuthorizeUrl` and `browserAuthorizeUrl`. The URL is deterministic and correct. The Safari failure is therefore a redirect/cookie issue — likely third-party cookie blocking on the `app.superset.sh` redirect domain or a platform-specific quirk with the OAuth consent flow in Safari on macOS. **Needs separate investigation; not caused by this PR's changes and not fixed by this PR.**

## FU-2: `--no-browser` UX parity with `anthropic` CLI

The BRIEF references Anthropic's CLI as a model. Their `--no-browser` flag has established user expectation. Option B (moderate) adds `--no-browser`; Option A (minimum) deliberately omits it to stay surgical. If Option A is chosen, FU-2 tracks the flag as a follow-on ticket.

## FU-3: `openBrowser()` not awaited — silent failures on Linux

**File:** `packages/cli/src/lib/auth.ts:320`

```typescript
void openBrowser(browserAuthorizeUrl);
```

`openBrowser` is fire-and-forget (`void`). On Linux, `xdg-open` can fail with a non-zero exit and the CLI gets no signal. The user sees the "Browser didn't open? Use the url below" message but doesn't know whether the browser opened or not. Even in non-cross-device Linux contexts, a failed `xdg-open` is silent. Could be fixed by awaiting `openBrowser` and updating UI state on failure — but this is a quality-of-life improvement orthogonal to the cross-device detection fix.
