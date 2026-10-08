import { command } from "../../../lib/command";
import { getSupersetConfigPath } from "../../../lib/config";
import {
	type ConfigCheckResult,
	checkConfigFile,
} from "../../../lib/config-check";

function describe(result: ConfigCheckResult): string {
	if (!result.exists) {
		return `${result.path}: no config file (not logged in; run: superset auth login)`;
	}
	const status = result.valid ? "valid" : "INVALID";
	const login = result.loggedIn ? "" : " (not logged in)";
	return [
		`${result.path}: ${status}${login}`,
		...result.issues.map((issue) => `  [${issue.severity}] ${issue.message}`),
	].join("\n");
}

export default command({
	description:
		"Validate the config file under ~/.superset before a hand edit or a bad restore surfaces as an auth failure; exits 1 on an error",
	skipMiddleware: true,
	run: async () => {
		const result = checkConfigFile(getSupersetConfigPath());
		if (!result.valid) process.exitCode = 1;
		return { data: result, message: describe(result) };
	},
});
