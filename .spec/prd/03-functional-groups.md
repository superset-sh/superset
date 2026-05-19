---
stability: FEATURE_SPEC
last_validated: 2026-05-19
prd_version: 1.0.0
---

# Functional Groups

The 10 Linear tickets in scope cluster into four functional groups, each delivering an independently-shippable slice of the initiative.

## Functional Groups

| Group | Prefix | Description |
|-------|--------|-------------|
| **Chat UI** | CHAT | The v2 chat pane experience — transport + state architecture, push-based streaming, builtin slash commands, composer model-settings menu. Anchors the "Chat UI" Linear milestone. |
| **Automations** | AUTO | The automations product surface — surfacing run failures legibly and making the "New workspace" target work at dispatch time. Both items are paid-feature reliability fixes. |
| **CLI & Host Service Auth** | CLI | The `superset` CLI ↔ host-service auth handshake — refreshing OAuth tokens during the host's lifetime, gating `start` on a valid session, and detecting cross-device contexts in `superset auth login`. |
| **Desktop UX Papercuts** | UX | Two daily-friction fixes in the desktop app: Cmd+W routing inside browser panes, and diff-viewer line numbering correctness. |

## Use Case Summary

| Group | Prefix | Use Cases | Count |
|-------|--------|-----------|-------|
| Chat UI | CHAT | UC-CHAT-01 (transport arch), UC-CHAT-02 (slash commands), UC-CHAT-03 (composer menu), UC-CHAT-04 (start-flow streaming) | 4 |
| Automations | AUTO | UC-AUTO-01 (loud failures), UC-AUTO-02 (new workspace target) | 2 |
| CLI & Host Service Auth | CLI | UC-CLI-01 (host-service auth refresh + expiry), UC-CLI-02 (cross-device login) | 2 |
| Desktop UX Papercuts | UX | UC-UX-01 (browser-pane Cmd+W), UC-UX-02 (diff-viewer line numbers) | 2 |
| **Total** | — | — | **10** |

## Group Dependency Notes

- **UC-CHAT-04 depends on UC-CHAT-01.** The push-based stream cannot be implemented until the canonical `ChatEvent` protocol and `session.watch` shape are defined.
- **UC-CLI-01 and UC-CLI-02 share `packages/cli/src/lib/auth.ts` and `packages/cli/src/lib/resolve-auth.ts` plumbing.** Order them as CLI-02 → CLI-01, or coordinate via shared utility extraction, to avoid merge conflicts.
- **UC-AUTO-01 and UC-AUTO-02 both touch the automation dispatch / runs surface** but are independent: UC-AUTO-01 improves error rendering for *any* failure; UC-AUTO-02 fixes one specific failure mode. They can ship in either order.
- **UX group is independent** of every other group; UC-UX-01 and UC-UX-02 can run in parallel.
