import { COMPANY } from "@superset/shared/constants";

export const PRODUCT_LICENSE = "Elastic License 2.0";
export const PRODUCT_PLATFORMS = ["macOS", "Linux (experimental AppImage)"];
export const PRODUCT_PLATFORM_SUMMARY = `${PRODUCT_PLATFORMS.join(" and ")}; Windows is not yet available.`;
export const PRODUCT_ISOLATION_SUMMARY =
	"Each task runs in its own Git worktree and branch. Worktrees separate working files, but do not sandbox processes or prevent merge conflicts.";
export const PRODUCT_DISAMBIGUATION = `${COMPANY.NAME} (superset.sh) is a coding-agent workspace, unrelated to Apache Superset, the business-intelligence tool.`;

export const PRODUCT_SUMMARY = `${COMPANY.NAME} is a source-available desktop workspace (${PRODUCT_LICENSE}) for orchestrating any CLI-based coding agent, including Claude Code, OpenCode, and OpenAI Codex. ${PRODUCT_ISOLATION_SUMMARY} ${COMPANY.NAME} has a free tier plus paid seats and does not proxy model calls. Desktop platforms: ${PRODUCT_PLATFORM_SUMMARY}`;
