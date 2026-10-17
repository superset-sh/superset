# Saved conversation identity foundation

The pure native validator checks supplied snapshots. It does not discover files,
import records, read credentials, launch providers or authorize a resume. The
ended-terminal account-resume path combines it with independent store, writer,
account and launch-claim guards. Synthetic tests exercise supported native shapes.

`validateNativeConversation` checks complete Claude or Codex JSONL against an
explicit provider, native UUID and canonical working folder. It returns a digest
and record counts without returning message content. It rejects ambiguous copies,
mixed identities, worker transcripts, missing folder evidence and malformed
records. The caller must obtain a stable, strictly UTF-8-decoded complete snapshot
and enumerate all matching paths in the selected store. A partial search is not
proof of uniqueness. Reads above 64 MiB, records above 8 MiB, and more than 100,000
records are unsupported here; no truncation is accepted.

This is structural identity evidence, not transcript replay or a guarantee that
the provider will restore every item. Unknown record types remain in the digest.
Claude sessions with changed working folders or mixed compaction-session identities
are refused pending a qualified lineage adapter. Multiple Codex rollout revisions
are refused pending authoritative revision selection. No newest-file heuristic is
used. Matching names, folders, timestamps or text never merge conversations.

## Integration boundary

The host's `trpc/router/saved-conversations` service and desktop's **Open saved
Claude conversation…** action use native validation to discover and adopt Claude
history in an existing matching workspace. The service binds the selected account
and canonical store, preserves a private recovery checkpoint and immutable source
provenance, and records terminal successors. Reopening follows the current local
history and successor instead of replaying the initial checkpoint.

Before launch, the service revalidates complete stable history, account identity,
known writers and its durable launch claim. It uses the exact native UUID with an
empty prompt. Provider hooks supply later native-session attribution. Detected
writers are a refusal condition, not a global exclusive-writer guarantee; the UI
requires the original conversation to be exited. Saved identity validation and
synthetic tests do not prove authenticated provider replay or background-job
restoration.

T3 discovery/import, standalone Codex import and terminal-to-ACP conversion remain
separate work. Future consumers must validate
source schema and read consistency, preserve native lineage and resolve the launch
environment through the account service. Never use `--continue`, `--last`, a title
or an app-thread ID as a substitute for an exact native UUID.

Original provenance remains separate from current local continuation. A changed
or missing original archive cannot justify replacing newer local work. Checkpoints
remain with adopted records, including after workspace deletion; automatic
reclamation requires a separate retention policy.

## Official evidence checked October 9, 2026

- [Claude sessions](https://code.claude.com/docs/en/sessions) documents exact-ID
  resume, cross-project duplicate refusal and limits of restored background work.
  JSONL remains internal and needs versioned fixtures.
- [Anthropic's session reader, b6e9d12](https://github.com/anthropics/claude-agent-sdk-python/blob/b6e9d12fe1cc98dde988ab7b7713c1feeee50c6c/src/claude_agent_sdk/_internal/sessions.py)
  distinguishes session ownership, worker records and message-chain reconstruction.
  This module checks identity and does not duplicate that chain reconstruction.
- [Codex CLI commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
  documents exact-ID resume and working-folder selection.
- [Codex protocol, 4bad6d7](https://github.com/openai/codex/blob/4bad6d78e9b50f9fa8bd941f1db012ed491ad2da/codex-rs/protocol/src/protocol.rs)
  defines `SessionMeta.id` as the thread identity; `session_id` can identify its root.
  Creator account metadata is historical, not the account used for this launch.
