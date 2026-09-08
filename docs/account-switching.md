# Account switching revision

Acceptance cases are the maintainer's macOS reproductions from issuecomment-5576208465. Automated tests reproduce their inputs; they do not establish a live macOS/429 handoff.

## Boundaries

- A machine account-owner process owns quota polling, credential writes, active-account pointers and settings. Organization host services use an authenticated local connection to it. Shutting down one organization does not transfer credential ownership to another organization engine. The owner exits after 30 seconds with no connected organizations; test runners never spawn it automatically.
- Provider parsing produces a model-scoped limit observation. Claude's structured rate_limit hook arms terminal observation; visible text remains compatibility evidence because hook ingress is not authenticated. Codex TUI fallback requires a stalled session, exhausted quota and a visible banner. App-server structured signals require a different execution transport and are not claimed for arbitrary TUI processes.
- Recovery decisions use the affected model, independently of proactive model preferences. Unknown model means considering every reported quota window. Missing corresponding destination windows and unavailable/stale reads cannot establish headroom. Refreshes target individual account entries and retain request budgets/backoff.
- A wait is bound to its terminal, event and account. It remains retryable through cooldown and provider reset, and is discarded when that session/event no longer exists. Other sessions cannot consume it. The UI names the model and reset time, offers refresh, and explains /model in the terminal.
- Session folder-trust updates also run in the owner and share its per-file state queue with identity writes. They do not re-enter the engine operation queue, because recovery can call back into trust seeding while a switch is in progress. External Claude writes remain guarded by fingerprint retries.
- The machine owner routes terminal actions to the owning organization. Local session checks run immediately before restarting; credentials never enter session commands or events.

## Reuse assessment

claude-swap, cc-swap and subswapper were inspected. All are MIT-licensed; each owns credentials and account switching itself. Invoking them would introduce a competing account manager. Their quota/event shapes informed the narrow adapter; none supplies Superset session recovery. No new external executable dependency is added.

Sources: https://code.claude.com/docs/en/hooks#stopfailure ; https://developers.openai.com/codex/app-server/ ; https://github.com/realiti4/claude-swap ; https://github.com/errhythm/cc-swap ; https://github.com/lawzava/subswapper
