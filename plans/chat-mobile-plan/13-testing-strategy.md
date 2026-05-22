---
stability: CONSTITUTION
last_validated: 2026-05-21
prd_version: 1.5.0
---

# Mobile Chat v2 — Testing Strategy

## Overview

Mobile chat v2 uses a three-layer testing pyramid aligned with the sprint delivery strategy:

| Layer | Framework | Scope | Sprint phase |
|-------|-----------|-------|--------------|
| **Unit** | `bun:test` | Shared logic, serializers, reducers, hooks | All phases (co-located) |
| **Component** | `@storybook/react-native` (Storybook 9) | Isolated UI component states | Phase 1 (component builds) |
| **E2E** | Maestro | Full user-facing flows against running app | Phase 2+ (service wiring) |

**Why this stack:**
- **Bun test** is already the monorepo standard (`packages/ui`, `packages/shared`, `packages/host-service` all use it).
- **Storybook** gives isolated component iteration — develop one component in one state without navigating through the full app. Stories double as visual documentation and pixel-perfect review targets.
- **Maestro** is the simplest YAML-based mobile E2E framework available: single binary install, zero app modification, no code required, built-in flakiness tolerance, architecture-agnostic. It is dramatically simpler than Detox (which requires app instrumentation) or Appium (which requires WebDriver drivers and complex configuration).

---

## Component Testing — Storybook with Custom Toggle + Build-Time Stripping

### Setup

Mobile uses `@storybook/react-native` (Storybook 9) with Expo, gated behind a custom root-level toggle — NOT a nested route.

**Custom root toggle:** the app root (`app/_layout.tsx`) checks `EXPO_PUBLIC_STORYBOOK` and conditionally renders either the Storybook app or the real app. This is a full swap at the root, so Storybook owns the entire viewport with no app chrome leaking through.

```tsx
// app/_layout.tsx (simplified)
const Storybook = process.env.EXPO_PUBLIC_STORYBOOK === 'true'
  ? require('../.rnstorybook').default
  : null;

export default function RootLayout() {
  if (Storybook) return <Storybook />;
  return <RealAppLayout />;
}
```

**Metro config** wraps with `@storybook/react-native/metro/withStorybook` for hot-reload support:

```js
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
const withStorybook = require("@storybook/react-native/metro/withStorybook");
module.exports = withStorybook(config);
```

**Config directory:** `.rnstorybook/` at mobile app root with `main.ts`:

```ts
// .rnstorybook/main.ts
import { StorybookConfig } from "@storybook/react-native";
const main: StorybookConfig = {
  stories: [
    "./stories/**/*.stories.?(ts|tsx|js|jsx)",
    "../components/chat/**/*.stories.?(ts|tsx|js|jsx)",
  ],
  addons: [
    "@storybook/addon-ondevice-controls",
    "@storybook/addon-ondevice-actions",
  ],
};
export default main;
```

**Dev script:** `"storybook": "EXPO_PUBLIC_STORYBOOK=true expo start"`

### Story conventions

- **Co-located** with components per AGENTS.md pattern: `ComponentName/ComponentName.stories.tsx`
- Every chat UI component gets stories for its states:
  - Loading, empty, error, populated, streaming, paused, approved, rejected, etc.
- Stories serve as **pixel-perfect review targets** — designers and reviewers verify components in Storybook without running the full app
- Decorators wrap stories with theme providers (`ThemeProvider`) and padding

### Build-time stripping

When `EXPO_PUBLIC_STORYBOOK` is unset (falsy — the default for all EAS production profiles), Metro's dead-code elimination removes the entire Storybook branch from the production bundle:

- The conditional `require('../.rnstorybook')` never executes → tree-shaking removes it
- `@storybook/react-native` and all `*.stories.tsx` files are excluded from the bundle
- Zero app store size impact, zero risk of Storybook being accessible in production

This is verified via bundle size audit: production build with and without the flag should show no size difference.

---

## E2E Testing — Maestro

### Why Maestro

| Framework | Setup | App modification | Flakiness handling | Write tests |
|-----------|-------|-------------------|-------------------|-------------|
| **Maestro** | Single binary | None | Built-in auto-wait + retry | YAML (no code) |
| Detox | Moderate | Requires instrumentation library | Manual wait/retry | JavaScript |
| Appium | Heavy | WebDriver drivers | Manual | JavaScript/Python |

Maestro operates at the UI layer ("arm's length") — it sees the app exactly as a user does, tapping buttons and reading labels. It requires zero changes to the app binary.

### Installation

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Test location and conventions

Flow files live in `.maestro/` at the mobile app root (`apps/mobile/.maestro/`).

**Naming convention:** one YAML file per user-facing flow, named by UC ID:

```
.maestro/
├── chat-sessions-list.yaml          # UC-SESS-01
├── chat-session-resume.yaml         # UC-SESS-02
├── chat-session-create.yaml         # UC-SESS-03
├── chat-session-end.yaml            # UC-SESS-04
├── chat-session-delete.yaml         # UC-SESS-05
├── chat-compose-send.yaml           # UC-COMP-01, UC-COMP-02
├── chat-stop-turn.yaml             # UC-COMP-03
├── chat-model-picker.yaml          # UC-COMP-04
├── chat-render-messages.yaml        # UC-RENDER-01
├── chat-render-streaming.yaml       # UC-RENDER-02
├── chat-render-markdown.yaml        # UC-RENDER-03
├── chat-render-tool-calls.yaml      # UC-RENDER-04
├── chat-tool-approval.yaml          # UC-PAUSE-01
├── chat-ask-user.yaml              # UC-PAUSE-02
├── chat-plan-approval.yaml          # UC-PAUSE-03
├── chat-push-notifications.yaml     # UC-PLATF-01
├── chat-background-resume.yaml      # UC-PLATF-02
├── chat-host-offline.yaml           # UC-PLATF-03
└── utils/
    └── login.yaml                   # Composable sub-flow
```

### Key commands used

- **Actions:** `launchApp`, `tapOn`, `inputText`, `scroll`, `swipe`, `longPressOn`
- **Assertions:** `assertVisible`, `assertNotVisible`, `extendedWaitUntil`
- **Flow composition:** `runFlow` (reusable sub-flows like login)
- **Environment:** `-e APP_ID=com.superset.app` for parameterized app IDs

### Example flow

```yaml
# .maestro/chat-session-create.yaml
appId: ${APP_ID}
---
- runFlow: utils/login.yaml
- tapOn: "New chat"
- assertVisible: "Send a message"
- inputText: "Hello from Maestro"
- tapOn: "Send"
- assertVisible: "Hello from Maestro"
```

### Platform support

- iOS Simulator (iOS 16+)
- Android Emulator (API 29+)

### CI integration

```bash
maestro test .maestro/ --env APP_ID=com.superset.app
```

Runs via GitHub Actions against an EAS development build installed on a simulator/emulator.

### Sprint relationship

Each service-wiring sprint (Phase 2+) defines its gate as one or more Maestro E2E flows passing. The sprint is done when the flows pass end-to-end against a running app on a simulator/emulator.

---

## Unit Testing — Bun Test

### Scope

Unit tests cover shared logic — not UI rendering (Storybook covers that):

- `serializeEditorToText.ts` — wire format parity with desktop
- Message reducer — optimistic append, deduplication, reconciliation
- Cursor/reconciliation protocol — background→foreground state catch-up
- Token/state utilities — model picker, thinking level, permission mode persistence

### Pattern

Follow the existing monorepo pattern (`packages/ui/src/components/ui/alert-dialog.test.ts`):

```ts
import { describe, expect, test } from "bun:test";
```

Co-located with source: `ComponentName/ComponentName.test.ts` or `hookName.test.ts`.

---

## Testing & Sprint Strategy

The sprint plan (generated by `/kb-sprint-plan`) organizes work into three phases aligned with the testing layers:

### Phase 1 — UI Components (Storybook-gated)

Build all chat UI components atomically. Storybook is critical here because it enables **isolated UI testing prior to service integration** — every component is verified against design tokens and its state contract before any backend wiring begins. This ensures UI fidelity is locked in early and doesn't drift during the service-wiring phase. Atomic composition (one component + its stories at a time) ensures speed and accuracy: each component is built, reviewed, and approved independently without waiting for transport or data layers.

The human testing gate is: **launch Storybook (`bun run storybook`), navigate to the component, verify all states render correctly against design tokens.**

Sprints in this phase:
- Message list components (UserMessage, AssistantMessage, MessageMarkdown, ToolCallBlock, PlanBlock, ReasoningBlock, SubagentExecutionMessage)
- Composer components (ChatInputFooter, TiptapPromptEditor, SlashCommandMenu, ModelPicker, PermissionModePicker)
- Pause prompt components (PendingApprovalCard, PendingApprovalFooter, PendingQuestionSheet, PlanReviewScreen, PendingActionIndicator)
- Container component (ChatInterface — assembles the above)

### Phase 2 — Service Wiring (Maestro-gated)

Wire up the transport, relay, and Electric layers behind the UI. Each sprint's gate is: **Maestro E2E flow(s) pass against the running app on a simulator/emulator.**

Sprints in this phase:
- Transport: host-service-client + relay HTTP + JWT auth
- Session lifecycle: list, create, resume, end, delete via Electric + cloud tRPC
- Message send/receive: compose → send → optimistic append → host acknowledges
- Pause flows: tool approval, ask_user, plan approval over relay

### Phase 3 — Platform Integration (Maestro + device-state gated)

Mobile-specific platform concerns. Gates combine Maestro flows with device-state simulation (background/foreground, network loss, push notification delivery).

Sprints in this phase:
- Background/foreground resume + cursor protocol
- Host-offline UX + automatic reconnect
- Push notifications (Expo push → deep-link to session)
- Multi-device session sync validation
