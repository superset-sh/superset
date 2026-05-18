---
stability: PRODUCT_CONTEXT
last_validated: 2026-05-18
prd_version: 1.0.0
---

# Roles

| Role | Description |
|------|-------------|
| **User** | End-user of the desktop app running v2 internal chat in a workspace. Sends messages, answers `ask_user` questions, approves tool calls and plans, switches sessions, and closes panes. The polish work targets visible correctness/UX (no ghost messages, errors are copyable, panes don't orphan agents) and invisible safety (their credentials don't leak across workspaces, their host-service can't be killed by another window). |
| **Developer** | Engineer working in the Superset monorepo. Reads `useChatDisplay`, modifies chat-pane components, adds new tRPC procedures, or maintains the host-service runtime. Polish targets affecting them: clear contracts (`stop`-only cancellation), enforced architectural invariants (`no-electron-coupling.test.ts` actually catches regressions), org-scoped authorization middleware available by default, `select-text` rule actually enforced in error UI. |
| **Operator** | Person responsible for the running desktop application's health — including the user-as-self-operator in single-user installs, and any future fleet/admin context. Polish targets affecting them: host-service crash visibility, in-flight turn loss is surfaced (not silent), credential refresh failures emit typed errors (not `console.warn` only), session title generation works so the session selector is usable. |
| **Reviewer** | Code reviewer and security auditor. Polish targets affecting them: every `publicProcedure` is either documented as intentionally public or migrated to `orgScopedProcedure`/`protectedProcedure`; no Category-3 stubs survive in the merged code; the preload IPC surface is enumerable as an allowlist; the host-service no-electron-coupling invariant is enforced at build time. |
