import { COMPANY } from "@superset/shared/constants";

// Single source of truth: the license and platform claims here are checked against
// LICENSE.md and the release targets, so keep them in one place. Lives in its own
// module (no fs imports) so client components can use it too.
export const PRODUCT_SUMMARY = `${COMPANY.NAME} is a source-available desktop workspace (Elastic License 2.0) for orchestrating any CLI-based coding agent, including Claude Code, OpenCode, and OpenAI Codex. Each task runs in an isolated Git worktree, so different agents can work in parallel without conflicts. ${COMPANY.NAME} has a free tier plus paid seats, does not proxy model calls, and supports macOS, with an experimental Linux AppImage and Windows not yet available.`;
