---
stability: PRODUCT_CONTEXT
last_validated: 2026-05-21
prd_version: 1.3.0
---

# Mobile Chat v2 — Overview

## Product description

Superset users do their chat-driven work on desktop today. The mobile app currently exposes only a terminal-via-web mirror (implicit mobile chat v1); there is no native chat-agent UI. This PRD covers **mobile-chat v2** — the first native mobile chat experience, mirroring the desktop ChatInterface functionally so users can review, respond to, and initiate chat sessions on remote/cloud hosts from their phone. The "v2" naming aligns with the platform's existing v2 generation of features (`v2-workspace`, `v2-projects`, `v2-hosts`).

The mobile chat is **not a re-architecture of chat** — it consumes the exact same `@superset/host-service` tRPC surface that desktop's renderer already consumes, routed through `apps/relay` (per-host WS tunnel) instead of `127.0.0.1`. Messages live in the host-service runtime memory (Mastra harness) and stream back over relay-routed HTTP+tRPC. Session metadata (`chat_sessions`) syncs to mobile via the existing ElectricSQL shape (`apps/electric-proxy/src/where.ts:136-137` already exposes `chat_sessions` filtered by org).

The mobile **UI** is a parallel React Native implementation of the desktop ChatInterface tree, not a shared component package — design-token parity via Tailwind class names (uniwind on mobile, Tailwind v4 on desktop), name parity per component, zero code reuse at the UI layer. This mirrors the validated pattern in `cadra-app/monorepo` (web `packages/ui/ai-elements/*` + mobile `apps/mobile/src/components/ui/chat/*` with shared component names, separate implementations).

## Problem statement

1. **Mobile users cannot review or respond to chat sessions on the go.** A user kicks off a long-running cloud session from desktop, leaves, and has no way to monitor progress, respond to a tool-approval prompt, or answer an `ask_user` question until they return to a laptop. Sessions stall mid-turn waiting for input that mobile cannot provide.

2. **Mobile users cannot initiate new chat work remotely.** A user thinking through a problem away from desktop must wait until they're back at a keyboard to start a session — even though the work itself runs on a remote/cloud host, not on the user's local FS.

3. **There is no shared component library between desktop and mobile.** Desktop's ChatInterface (React DOM + Tailwind + Radix) is incompatible with React Native at the JSX layer. Any prior assumption that "shared UI" would unlock mobile chat is false; mobile UI is net-new work regardless.

4. **The transport surface to make this work already exists.** `apps/relay` per-host WS tunneling, `@superset/host-service` tRPC AppRouter, and the `chat_sessions` Electric shape are already production-ready. What's missing is mobile-side wiring + a mobile-native UI port.

## Solution summary

Build a mobile chat surface in `apps/mobile` with the following shape:

1. **Transport: typed HTTP+tRPC client against `@superset/host-service`'s `AppRouter`**, URL pointed at the relay tunnel for the user's active host. Mirrors `apps/desktop/src/renderer/lib/host-service-client.ts` (the existing renderer→host-service HTTP pattern desktop already uses for v2 workspaces, project setup, etc.). Mobile differs only in URL resolution (relay-routed) and authentication (JWT bearer instead of session cookie).

2. **Session listing via existing Electric shape.** `chat_sessions` is already published; mobile adds a `chatSessions` collection to `apps/mobile/lib/collections/collections.ts` alongside the tasks/projects/members collections it already manages. Realtime updates come for free.

3. **UI: parallel RN tree at `apps/mobile/components/chat/`**, mirroring the desktop ChatInterface component names (ChatInterface, MessageList, MessagePartsRenderer, UserMessage, AssistantMessage, etc.) but built with `@rn-primitives/*` + uniwind. Design audit (`f3e68314b`) confirmed ~80% of desktop's top-30 Tailwind classes work as-is under uniwind; the remaining ~20% has known mechanical translations.

4. **Mid-turn interactive prompts as bottom sheets** (`@gorhom/bottom-sheet`), not inline cards. Approval / ask-user / plan-approval are the three pause states that block session progress; mobile thumb-reach UX favors sheets over inline rows.

5. **Tiptap parity** via `@10play/tentap-editor` (WebView-hosted Tiptap) so slash commands and file mentions render with the same atomic-token UX as desktop. Wire format (`serializeEditorToText.ts`) is portable.

6. **Live token streaming via the relay's HTTP path** (decision deferred between SSE-through-relay vs polling-with-offset; mobile-chat v2 may ship with periodic snapshot polling and add streaming in a follow-up sprint).

7. **OS push notifications via Expo push** wired to host-service lifecycle events, so users learn about agent completions and pause-prompts even when the mobile app is backgrounded. This is a mobile-specific need that has no desktop analog.

The result: a Superset user can list workspaces and sessions on their phone, open a session, read its history, see a streaming response, approve a tool call from a bottom sheet, and submit a new message — all backed by the same agent loop that desktop drives, with no new server-side architecture.
