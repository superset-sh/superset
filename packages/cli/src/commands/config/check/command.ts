import { existsSync, readFileSync } from "node:fs";
import { command } from "../../../lib/command";
import { SUPERSET_CONFIG_PATH } from "../../../lib/config";
import { type ConfigCheckIssue, checkConfig } from "../../../lib/config-check";

function formatIssue(issue: ConfigCheckIssue): string {
	const label = issue.severity === "error" ? "error" : "warning";
	return `  [${label}] ${issue.message}`;
}

export default command({
	description:
		"Validate ~/.superset/config.json — catches a hand-edit or bad restore before it surfaces as a confusing auth failure",
	skipMiddleware: true,
	run: async () => {
		const raw = existsSync(SUPERSET_CONFIG_PATH)
			? readFileSync(SUPERSET_CONFIG_PATH, "utf-8")
			: undefined;
		const result = checkConfig(raw, SUPERSET_CONFIG_PATH);

		if (!result.exists) {
			return {
				data: result,
				message: `No config file at ${SUPERSET_CONFIG_PATH} — not logged in yet. Run: superset auth login`,
			};
		}

		const lines = [
			`${SUPERSET_CONFIG_PATH}: ${result.valid ? "valid" : "INVALID"}${result.loggedIn ? "" : " (not logged in)"}`,
		];
		if (result.issues.length > 0) {
			lines.push(...result.issues.map(formatIssue));
		}

		return { data: result, message: lines.join("\n") };
	},
});
