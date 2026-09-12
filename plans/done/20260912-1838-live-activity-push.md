# Keep the Lock Screen agent card current with APNs pushes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template in `.agents/skills/create-plan`.


## Purpose / Big Picture


The iPhone app shows a Live Activity (a card on the Lock Screen and in the Dynamic Island) listing the agents running on the user's machines and what each one wants: working, needs you, failed, or finished and waiting for review. Today that card is only fed while the app is open in the foreground, because the phone polls each machine every five seconds and iOS stops that polling the moment the phone locks. Two minutes later the card dims and goes stale. That defeats the point of a Lock Screen card.

After this change the card keeps itself current with the phone in a pocket. When an agent starts, finishes, or gets stuck, the machine it runs on tells the Superset API, the API records the agent's state and sends an Apple push that rewrites the card. Nothing on the phone has to be running. The card also appears on its own the first time an agent starts, via Apple's push-to-start, so the user never has to open the app to get it.

You can see it working by installing a build on a real iPhone, locking it, starting an agent on your Mac from the desktop app, and watching the card appear and then change from "Working" to "Review" when the agent stops, with the phone never unlocked.


## Assumptions


The Superset API can reach Apple's push service (APNs) from a Vercel function using Node's built-in `http2` module. Vercel Fluid Compute runs ordinary Node, so this should hold; it is verified in milestone 3.

An APNs authentication key (a `.p8` file) either already exists in the EAS credentials for the app `sh.superset.mobile` or Satya can create one in the Apple Developer portal. Only an Apple account holder can create one. The plan works with whichever key exists; the key id, team id and private key become API secrets.

The mobile app build already carries the `aps-environment` entitlement because `expo-notifications` is in the plugin list and its config plugin adds that entitlement. Verified in milestone 5 by reading the generated entitlements after `expo prebuild`.

Apple's per-device budget for high-priority Live Activity pushes is enough for a normal day. Low-priority pushes are used for the frequent "working" transitions so that budget is only spent on the transitions a person cares about.


## Open Questions


None block implementation. Two items are deferred and recorded in the Decision Log: phone-side "seen" marks, and host-offline detection for pushed cards.


## Progress


- [x] (2026-09-12 18:38Z) Discovery complete; plan drafted.
- [x] (2026-09-12 19:05Z) Milestone 1: `TerminalAgentStatusReporter` with seven tests, wired in `app.ts`, reports all gone on dispose. Commit 645125f3c.
- [x] (2026-09-12 19:30Z) Milestone 2: `v2_agent_status` and `v2_live_activity_tokens`, migration 0115 generated and applied on the workspace Neon branch, `host.reportAgentStatus`, `mobile.liveActivity.registerToken` and `releaseToken`. Commit 3fb617dc5, transaction fix 42d1ed652.
- [x] (2026-09-12 19:30Z) Milestone 3: APNs sender over Node http2 with a node:crypto ES256 JWT, card builder with tests, per-user fan-out with push-to-start, update, end and dead-token handling.
- [x] (2026-09-12 19:50Z) Milestone 4: module emits tokens and remembers them, activities start with `pushType: .token`, rows carry `since`, widget ticks relative time, `useLiveActivityPushTokens` registers with labels. Commit 877fbd14a. Simulator build of the app and widget succeeded.
- [x] (2026-09-12 20:05Z) Milestone 5: env schema, both templates, both local `.env` files, both deploy workflows. `aps-environment` confirmed present in the prebuilt entitlements. EAS already holds an APNs key (portal id BW3334AKHK, team NV9657CS5A). Commit 64023fa2a.
- [x] (2026-09-12 20:30Z) Milestone 6, API half: local API on the Neon branch driven as a fresh user against a fake APNs HTTP/2 server: start push at priority 10 with rows ordered permission, failed, review, working and "+2 more"; update at priority 5 on token registration; end with a dismissal date and token deletion; push-to-start again after an empty fleet; 410 deletes the token; provider JWT verified ES256 against the key.
- [ ] Milestone 6, device half: real iPhone with a build carrying the entitlement, API configured with the real key. Needs the `.p8` for key BW3334AKHK as `APNS_PRIVATE_KEY` plus `APNS_KEY_ID` and `APNS_TEAM_ID` in the production secrets, and a development or TestFlight build.


## Surprises & Discoveries


- Observation: the host already forwards tool-call hook events as lifecycle events. `PostToolUse` maps to "Start" and `PermissionRequest` to "PermissionRequest" in `packages/host-service/src/events/map-event-type.ts`, so a busy agent generates hundreds of events an hour on the host, but the derived state only changes a handful of times.
  Evidence: Satya's own Claude transcripts for Sep 5 to 12 show a median of 154 tool calls per active hour against roughly 60 state transitions.

- Observation: the API cannot translate strings. `packages/trpc/src/i18n-error.ts` only ships an error cause that the clients translate. The pushed card needs the status words in the user's language.
  Evidence: no Lingui import anywhere under `packages/trpc/src`.

- Observation: the shared `db` client is neon-http and refuses transactions; the repo keeps `dbWs` for those.
  Evidence: the first end-to-end run failed `host.reportAgentStatus` with "No transactions support in neon-http driver". Fixed in 42d1ed652.

- Observation: `expo-notifications` in the plugin list already adds `aps-environment` to the app entitlements, so no `app.config.ts` change was needed.
  Evidence: `bunx expo prebuild --platform ios --no-install` produced `aps-environment: development` in `ios/Superset/Superset.entitlements`.

- Observation: EAS already holds an APNs push key for the app.
  Evidence: `eas credentials -p ios` lists Push Key, Developer Portal ID BW3334AKHK, team NV9657CS5A. Its private half is not in the repo and must be provided as a secret.


## Decision Log


- Decision: the host reports derived state transitions, never raw hook events, after a two second debounce.
  Rationale: cuts API volume four to five times and makes tool-call bursts free. The host already owns the state machine in `TerminalAgentStore`.
  Date/Author: 2026-09-12, Claude with Satya.

- Decision: the only states that cross the wire are `working`, `review`, `permission`, `failed`, and `gone`.
  Rationale: those are the four the card can draw plus removal. Satya: "the only state we need to push is done / start / is stuck".
  Date/Author: 2026-09-12, Satya.

- Decision: the API stores the latest state per terminal in a new table `v2_agent_status`, keyed by organization, machine and terminal.
  Rationale: a push must rewrite the whole card, which spans every machine the user can see, so the API needs the fleet, not just the transition. This is the one architectural cost: the cloud now holds agent status, which was host-only. Rows are tiny and deleted on `gone`.
  Date/Author: 2026-09-12, Claude, accepted by Satya.

- Decision: the phone keeps updating the card while the app is in the foreground; the API pushes on every transition regardless. Superseded an earlier draft that made the server the only writer.
  Rationale: a dev API without an APNs key would leave the card frozen on its first snapshot, and the foreground path is already verified. The two views only differ on rows the phone has marked seen, which the next transition reconciles.
  Date/Author: 2026-09-12, Claude.

- Decision: the phone sends its translated status words with the token registration. The token row stores `labels` as JSON: `working`, `review`, `permission`, `failed`, and a `more` template containing `{n}`.
  Rationale: Lingui catalogs stay the single source of translations, the API stays translation-free, and the widget stays a dumb renderer. A locale change re-registers.
  Date/Author: 2026-09-12, Claude.

- Decision: the card carries `since` as a Date per row and the widget renders elapsed time with SwiftUI's relative text style, which ticks by itself.
  Rationale: a pushed card lives for hours without another push, so a preformatted "12m" would freeze. iOS localizes the relative style for free.
  Date/Author: 2026-09-12, Claude.

- Decision: `working` transitions go at APNs priority 5, everything else at priority 10.
  Rationale: Apple budgets high-priority Live Activity updates per device. Working is the frequent, boring transition.
  Date/Author: 2026-09-12, Claude.

- Decision: APNs is called with Node `http2` and a JWT signed in the function with `jose`, which `apps/api` already depends on. No push library.
  Rationale: a persistent connection is not available on a serverless function anyway, and the whole client is under a hundred lines.
  Date/Author: 2026-09-12, Claude.

- Decision (deferred): phone-side "seen" marks do not reach the server. A reviewed session shows "Review" on the card until its next transition. The desktop's clearing of statuses on the host does reach the card, because it changes the host store and the reporter re-derives.
  Rationale: adding a seen endpoint is a separate, small change and does not gate the value here.
  Date/Author: 2026-09-12, Claude.

- Decision (deferred): a host that dies without reporting `gone` leaves its rows on the card. The host reports every terminal `gone` on graceful shutdown; a crash is not handled in this change. The foreground path still ends the activity when the phone sees an empty fleet.
  Rationale: presence detection belongs to the relay, which already knows; wiring it in is a follow-up.
  Date/Author: 2026-09-12, Claude.


## Outcomes & Retrospective


Everything up to the phone is built and proven without Apple: a host reports only state transitions, the API stores the fleet and produces exactly the pushes the widget expects, and the app hands tokens over with its own translated labels. The Swift side compiles in a simulator build. What is not proven is the last hop, Apple delivering to a real phone, which needs the production key and a native build; both are Satya's to provide. The one design change made during implementation was keeping the foreground JS updater alive alongside the pushes rather than making the server the only writer, because a dev API without an APNs key would otherwise leave the card frozen on its first snapshot; the plan's Decision Log entry about a single writer is superseded by that.


## Context and Orientation


Superset is a monorepo. The pieces this plan touches:

The host-service, in `packages/host-service`, is the process that runs on a user's Mac (or inside a cloud sandbox) and owns terminals and the agents running in them. It learns what an agent is doing through hook scripts that the agent runtimes call; those land in `packages/host-service/src/trpc/router/notifications/notifications.ts` and are recorded in `packages/host-service/src/terminal-agents/store.ts` (class `TerminalAgentStore`). Each terminal has a binding with `lastEventType`, one of `Attached`, `Detached`, `Start`, `PermissionRequest`, `Failed`, `Stop`, and the store emits a `change` event with the workspace id after every write. The host talks to the cloud API through `ctx.api`, a tRPC client built in `packages/host-service/src/api/createApiClient` that sends the user's JWT and an organization header, so cloud calls run as the user who registered the host.

The API is a Next.js app in `apps/api` whose tRPC routers live in `packages/trpc/src/router`. `jwtProcedure` in `packages/trpc/src/trpc.ts` is the procedure kind hosts call; it gives `ctx.userId`, `ctx.organizationIds`, and `ctx.activeOrganizationId`. The database is Postgres on Neon through Drizzle; schema files are in `packages/db/src/schema`. Hosts are rows in `v2_hosts` (organization id + machine id) and the users who can see a host are rows in `v2_users_hosts`. The API already makes an outbound fire-and-forget call after writes in `packages/trpc/src/lib/realtime.ts`, using `waitUntil` from `@vercel/functions`; the APNs sender copies that shape.

The mobile app is Expo in `apps/mobile`. The Live Activity is an Expo native module in `apps/mobile/modules/live-activity` (`src/index.ts` for the JS API, `ios/LiveActivityModule.swift` for the native side) and a widget extension in `apps/mobile/targets/agentactivity` (`AgentActivityWidget.swift` draws the card; `AgentActivityAttributes.swift` declares the content, and an identical copy lives in `modules/live-activity/ios` because both targets need the type). The hook that builds the card from polled data is `apps/mobile/screens/(authenticated)/(home)/home/hooks/useAgentLiveActivity/useAgentLiveActivity.ts`, fed by `useHostTerminals` in the sibling folder, which derives a terminal's attention from `lastEventType`.

Terms. A Live Activity is Apple's mechanism for a live card on the Lock Screen; its content is a Codable struct called the ContentState, at most 4 KB. APNs is Apple's push service; a Live Activity push is an HTTP/2 POST to `api.push.apple.com/3/device/<token>` with topic `<bundle id>.push-type.liveactivity` and a JSON body whose `aps.content-state` replaces the card's content. A push token is a per-activity hex string the phone receives after starting an activity with `pushType: .token`; a push-to-start token is a per-app token (iOS 17.2 and later) that lets a server start an activity from nothing. A `.p8` key is the Apple-issued private key used to sign the JWT that authenticates the server to APNs.


## Plan of Work


### Milestone 1: the host reports transitions


Add `packages/host-service/src/terminal-agents/status-reporter/status-reporter.ts` exporting `class TerminalAgentStatusReporter` with the constructor taking `{ store, api, machineId, resolveTerminal, debounceMs }` where `resolveTerminal(terminalId)` returns the workspace name, project id and project name for a terminal, or `null` if the workspace is unknown. The reporter subscribes to the store's `change` event. On every change it derives, for every binding in `store.list()`, a state with the same rules the phone uses today: `PermissionRequest` gives `permission`, `Start` gives `working`, `Failed` gives `failed`, `Stop` gives `review`, a binding with `endedAt` set or a missing terminal gives `gone`, anything else gives no state, which is also reported as `gone` if that terminal was reported before. It compares against `lastReported: Map<terminalId, state>` and collects differences. A single timer, restarted on every change, fires after `debounceMs` (2000 in production) and sends one `api.host.reportAgentStatus.mutate({ machineId, terminals })` with every pending difference, then records them as reported. A failed call leaves the differences pending and retries on the next change; log at warn, never throw. Expose `flush()` for tests and shutdown, and `reportAllGone()` which the host calls when it shuts down.

Wire it in `packages/host-service/src/app.ts` right after `terminalAgentStore` is constructed, using `api`, `config.machineId`, and a resolver that reads the local `workspaces` and `projects` tables through the existing local db. Call `reportAllGone()` from the existing shutdown path.

Tests in `status-reporter.test.ts` next to it, with a fake store (an `EventEmitter` with `list()`) and a fake api that records calls: a burst of ten `Start` events for one terminal produces one call with one `working` entry; `Start` then `Stop` inside the debounce window produces one call with `review`; a failed call retries with the same entry on the next change; an ended binding reports `gone` exactly once.


### Milestone 2: the API stores the fleet


Schema, in `packages/db/src/schema/schema.ts` next to `v2UsersHosts`: table `v2_agent_status` with `organizationId`, `machineId`, `terminalId`, `workspaceId`, `workspaceName`, `projectId` nullable, `projectName` nullable, `state` as a new enum `v2_agent_state` with `working`, `review`, `permission`, `failed`, `sinceAt` timestamp, `updatedAt` timestamp; primary key on organization, machine, terminal; foreign key to `v2_hosts` like `v2_users_hosts` has. Table `v2_live_activity_tokens` with `id` uuid, `userId`, `organizationId`, `kind` as enum `v2_live_activity_token_kind` with `update` and `push_to_start`, `token` text unique, `activityId` nullable, `labels` jsonb, `createdAt`, `updatedAt`. Generate the migration on a fresh Neon branch exactly as `.agents/skills/db-migrations/SKILL.md` says; never touch `packages/db/drizzle` by hand.

Mutation `reportAgentStatus` on the host router in `packages/trpc/src/router/host/host.ts`, a `jwtProcedure` taking `machineId` and up to 200 `terminals`, each `{ terminalId, workspaceId, workspaceName, projectId?, projectName?, state, sinceAt }` where `state` includes `gone`. It checks the caller has a `v2_users_hosts` row for the machine in `ctx.activeOrganizationId`, upserts the non-gone rows, deletes the gone ones, then hands the organization and machine to the push step from milestone 3 inside `waitUntil`.

Mutations `liveActivity.registerToken` and `liveActivity.releaseToken` on a new `mobile` router in `packages/trpc/src/router/mobile`, `jwtProcedure` too since the phone also sends a JWT. Register upserts by token; release deletes by token.


### Milestone 3: the API pushes the card


`packages/trpc/src/lib/apns/apns.ts` exports `sendLiveActivityPush({ token, event, contentState, priority, staleDate?, attributes? })`. It builds the JWT with `jose` (`SignJWT`, ES256, `kid` from env, `iss` = team id, `iat` now), opens `http2.connect("https://api.push.apple.com")`, POSTs with headers `apns-topic: ${bundleId}.push-type.liveactivity`, `apns-push-type: liveactivity`, `apns-priority`, `authorization: bearer <jwt>`, and resolves `{ status, reason }`. A 410 or a 400 with reason `BadDeviceToken` means the token is dead and the caller deletes it. Timeout five seconds, close the session in `finally`. The JWT is cached in module scope for 50 minutes; Apple accepts a token for an hour.

`packages/trpc/src/lib/live-activity-card.ts` exports `buildCardContentState({ rows, labels })` where rows are the fleet's `v2_agent_status` rows and returns the ContentState the widget expects: rows ordered by the same priority the phone uses (`permission` 4, `failed` 3, `review` 2, `working` 1, then most recent `sinceAt`), capped at four, each row `{ id, workspaceId, name, project, iconFile: projectId ? `${projectId}.png` : null, status: labels[state], state, since: sinceAt in ms, isQuiet: false }`, plus `more` from the template when rows were dropped, `totalCount`, `topState`, `staleDetail: ""`. This is a pure function with tests.

`packages/trpc/src/lib/live-activity-push.ts` exports `pushCardsForHost({ organizationId, machineId, priority })`: finds every user with a `v2_users_hosts` row for the machine, loads every token for those users in that organization, loads the fleet, which is every `v2_agent_status` row for machines those users can see in the organization, and for each user builds the content state with that token's labels. For each `update` token it sends `event: "update"`; if a user has no `update` token but has a `push_to_start` token and the fleet is not empty it sends `event: "start"` with `attributes-type: "AgentActivityAttributes"` and `attributes: { machineName: "" }`. If the fleet is empty it sends `event: "end"` to every `update` token with `dismissal-date` now and deletes those rows. Dead tokens are deleted. Sends run concurrently with `Promise.allSettled`.


### Milestone 4: the phone hands out tokens and stops writing content


In `AgentActivityAttributes.swift` (both copies), replace `elapsed: String` with `since: Date` on `AgentRow`. In `AgentActivityWidget.swift`, render `Text(row.since, style: .relative)` in place of the elapsed text and drop the `timeWidth` frame to a `minWidth`. Keep `staleDetail` and `more`.

In `LiveActivityModule.swift`: request activities with `pushType: .token`; add `Events("onPushToken", "onPushToStartToken")`; in `OnStartObserving`, spawn tasks that iterate `Activity<AgentActivityAttributes>.pushToStartTokenUpdates` and, for every current and future activity (`Activity.activityUpdates`), `activity.pushTokenUpdates`, emitting the hex token with the activity id. Add `AsyncFunction("end", id)`. Change the `since` field on `AgentRowRecord` to `Double` milliseconds.

In `modules/live-activity/src/index.ts`, `AgentRow.elapsed` becomes `since: number`; add the two event subscriptions via `EventEmitter` from `expo`.

New hook `apps/mobile/screens/(authenticated)/(home)/home/hooks/useLiveActivityPushTokens/useLiveActivityPushTokens.ts`: subscribes to both events and calls `trpc.mobile.liveActivity.registerToken` with `{ kind, token, activityId?, labels }` where labels are the four Lingui status words plus the `more` template; re-registers when the locale changes; on token release events (an activity ending) calls `releaseToken`. Mount it in the home screen next to `useAgentLiveActivity`.

In `useAgentLiveActivity.ts`: the hook keeps starting an activity from the foreground when the fleet is non-empty and none exists, and keeps ending it when the fleet is empty, but stops calling `update`. Its snapshot carries `since` timestamps instead of `elapsed`, and `staleAfterSeconds` goes away because the card is now push-fed.


### Milestone 5: secrets, env, entitlement


Env vars `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the `.p8` contents with literal `\n`), `APNS_BUNDLE_ID`, and `APNS_HOST` (defaults to `api.push.apple.com`; `api.sandbox.push.apple.com` for development builds). Follow every step in `docs/environment-variables.md`: `gh secret set` for each, schema in `packages/trpc/src/env.ts`, both `.env` templates, the root `.env`, and both deploy workflows in two places each.

Verify the entitlement by running `bunx expo prebuild --platform ios --no-install` in `apps/mobile` and reading `ios/supersetmobile/supersetmobile.entitlements` for `aps-environment`. If it is missing, add `"aps-environment": "production"` to `ios.entitlements` in `app.config.ts`.

Find or create the APNs key: run `bunx eas-cli credentials --platform ios` in `apps/mobile` and look under Push Notifications. This step is interactive and needs Satya's Apple account if a key must be created.


### Milestone 6: verification on a device


Unit tests cover the reporter, the card builder and the token bookkeeping. The API path is exercised locally: run the API against the Neon branch, run a host-service against it, start an agent, and select from `v2_agent_status`. The APNs path needs a real iPhone with a build that has the entitlement: install a development build, sign in, open Home once so an activity starts and its token registers, lock the phone, then start and stop an agent on the Mac. The card must appear and change without unlocking.


## Concrete Steps


All commands run from the repository root unless stated.

    bun run typecheck
    bun run lint
    bun test packages/host-service/src/terminal-agents
    bun test packages/trpc/src/lib
    # Expected: no errors, all tests pass

Migration, per the db-migrations skill: create a Neon branch, point the root `.env` at it, then

    cd packages/db
    bunx drizzle-kit generate --name="agent_status_and_live_activity_tokens"
    bunx drizzle-kit migrate
    # Expected: one new SQL file under packages/db/drizzle, applied to the branch only

Mobile typecheck runs from the root, as `reference_mobile_typecheck_only_root_matches_ci` warns:

    bun run typecheck --filter=@superset/mobile


## Validation and Acceptance


After milestone 1, with a host-service running against a local API, starting Claude in a workspace and letting it finish produces exactly two `reportAgentStatus` calls in the API log: one `working`, one `review`, regardless of how many tool calls happened between them.

After milestone 3, calling `pushCardsForHost` in a test with a fake sender produces one push per registered token whose `content-state.rows` are ordered permission first and capped at four.

After milestone 4, on a device, the card's elapsed column counts up on its own while locked.

After milestone 6, the device test in that milestone passes.


## Idempotence and Recovery


Reporting is idempotent: the API upserts by key and deletes by key, so a retried report is harmless. Token registration upserts by token. Migrations are generated once; if generation is repeated the second file must be deleted before commit, never edited. If APNs rejects every push with 403 `InvalidProviderToken`, the key id, team id or key contents are wrong; nothing else changes. If it rejects with 400 `TopicDisallowed`, the build lacks the entitlement.


## Artifacts and Notes


Measured event volume, Satya's transcripts, Sep 5 to 12, 119 active hours: tool calls per hour median 154, p90 521, max 1577; attention transitions per hour roughly 60 median, 460 worst hour.


## Interfaces and Dependencies


Host to API, tRPC on `host` router:

    reportAgentStatus: {
      machineId: string;
      terminals: Array<{
        terminalId: string; workspaceId: string; workspaceName: string;
        projectId?: string; projectName?: string;
        state: "working" | "review" | "permission" | "failed" | "gone";
        sinceAt: number;
      }>;
    } -> { ok: true }

Phone to API, tRPC on `mobile` router:

    liveActivity.registerToken: {
      kind: "update" | "push_to_start"; token: string; activityId?: string;
      labels: { working: string; review: string; permission: string; failed: string; more: string };
    } -> { ok: true }
    liveActivity.releaseToken: { token: string } -> { ok: true }

Widget ContentState, unchanged names except `elapsed` becomes `since: Date`.
