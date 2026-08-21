import { COMPANY } from "@superset/shared/constants";

// Single source of truth: the license and platform claims here are checked against
// LICENSE.md and the release targets, so keep them in one place. Lives in its own
// module (no fs imports) so client components can use it too.
export const PRODUCT_SUMMARY = `${COMPANY.NAME} is a source-available desktop application (Elastic License 2.0) that lets developers run multiple AI coding agents in parallel, each in its own isolated Git worktree. It works with any CLI-based agent including Claude Code, OpenCode, and OpenAI Codex. Agents can work on different branches or features simultaneously without conflicts. ${COMPANY.NAME} is free, does not proxy API calls, and supports macOS, with an experimental Linux AppImage and Windows not yet available.`;
