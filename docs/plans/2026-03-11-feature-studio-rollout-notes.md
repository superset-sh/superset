# Feature Studio Rollout Notes

Date: 2026-03-11
Status: Draft rollout guide

## Purpose

This note captures the operational guardrails for rolling out `feature-studio` while keeping the existing `agent-desk` path available.

## Required Environment

The following environment variables must be configured before enabling real execution:

- `DATABASE_URL`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` when the workspace deploys under a Vercel team
- `FEATURE_STUDIO_REPO_ROOT`
- `FEATURE_STUDIO_WORKTREE_BASE`
- `FEATURE_STUDIO_BASE_BRANCH`
- `FEATURES_SERVER_URL` for desktop-to-server routing in local and staged environments

## Database and Migration Guardrails

- Do not use `local-db` as the source of truth for feature requests, approvals, runs, or registrations.
- Generate schema migrations from a Neon branch only.
- Do not hand-edit generated Drizzle migration files.
- Roll out schema first, then application code, then desktop surfaces.

## Runtime Guardrails

- Keep preview creation server-side so a desktop restart does not break workflow continuity.
- Keep one feature request mapped to one branch and one worktree lineage.
- Persist all approval decisions and preview metadata before exposing registration actions.
- Treat `feature_request_runs.workflow_step` plus durable request status as the restart source of truth.

## Rollout Sequence

1. Deploy the `features-server` schema and server feature to a staging environment.
2. Configure Vercel credentials and verify preview creation from staging.
3. Enable Atlas Studio surfaces in desktop for internal users only.
4. Run the happy-path request flow through spec generation, approval, preview QA, customization, and registration.
5. Mark `agent-desk` as deprecated for new feature authoring work.
6. Keep old `agent-desk` code in place until Feature Studio reaches operational parity.

## Validation Checklist

- A request can be created and survives restart.
- Spec and plan artifacts are generated and visible in Atlas Studio.
- A pending approval remains actionable after app or server restart.
- Worktree metadata and preview URL are stored durably.
- Agent QA report appears in the request detail screen.
- Human QA can move the request into `customization`.
- Registration approval can move the request into `pending_registration`.
- Final registration creates both a registration row and a Feature Catalog entry.

## Cutover Notes

- Route all new feature-authoring investment to `feature-studio`.
- Keep `agent-desk` stable but avoid adding new product workflow there.
- Do not remove `agent-desk` exports until rollout validation has passed in real environments.
