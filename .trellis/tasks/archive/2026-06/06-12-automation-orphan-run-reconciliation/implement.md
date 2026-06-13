# Implementation Plan

1. Add automation run reconciliation schema and router mutation.
2. Add pure helper tests for stale timeout decision and terminal-state-safe
   idempotence.
3. Add list merge helper and use it in Automations page with a fresh cloud list
   query fallback.
4. Wire detail page to reconcile selected non-terminal runs on a slow polling
   cadence.
5. Keep host selection independent from project setup. Project context must not
   trigger clone checks, workspace creation, or local setup reroutes.
6. Translate machine-local agent config ids to portable preset ids when a run
   is rerouted across hosts.
7. Replace default Automation workspace dispatch with a host-service background
   Automation runner that uses a run-scoped directory, captures output, and
   never creates v2 workspaces/worktrees.
8. Make new Automation creation not require Project/Workspace; Project remains
   optional context.
9. Run focused tests, lint, typecheck.
10. Validate with real desktop view by actually clicking `Run now`; record
   screenshot, console logs, and newest `automation_runs` row.
