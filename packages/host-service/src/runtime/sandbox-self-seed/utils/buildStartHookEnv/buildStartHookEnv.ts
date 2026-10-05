import { stripTerminalRuntimeEnv } from "../../../../terminal/env-strip.ts";

const SANDBOX_IDENTITY_KEYS = [
	"SUPERSET_SANDBOX_WORKSPACE_ID",
	"SUPERSET_SANDBOX_ORGANIZATION_ID",
	"SUPERSET_SANDBOX_CREATOR_USER_ID",
] as const;

export function buildStartHookEnv(
	hostEnv: NodeJS.ProcessEnv,
	managedEnv: Record<string, string>,
): Record<string, string> {
	const stringEnv: Record<string, string> = {};
	for (const [key, value] of Object.entries(hostEnv)) {
		if (typeof value === "string") stringEnv[key] = value;
	}
	// A dev host-service started by the hook would otherwise share
	// SUPERSET_RUN_DIR's ptyd.sock with this one and replace its daemon.
	const env = stripTerminalRuntimeEnv(stringEnv);
	delete env.PORT;
	for (const key of SANDBOX_IDENTITY_KEYS) {
		const value = hostEnv[key];
		if (value) env[key] = value;
	}
	return { ...env, ...managedEnv, IS_SANDBOX: "1" };
}
