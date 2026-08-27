import {
	TERMINAL_TERM_PROGRAM,
	TERMINAL_TERM_PROGRAM_VERSION,
} from "@superset/shared/constants";
import { CONTAINER_SUPERSET_DIR } from "./paths.ts";
import type { TerminalLaunchContext } from "./workspace-runtime.ts";

export interface ContainerTerminalEnvParams {
	ctx: TerminalLaunchContext;
	hostAgentHookUrl: string;
	/** Host env var names forwarded verbatim (config `sandbox.env`). */
	envPassthrough: string[];
	hostEnv: Record<string, string | undefined>;
}

/**
 * Env for the shell INSIDE the sandbox container, passed via `docker exec
 * -e`. Deliberately minimal — the host login-shell snapshot never crosses
 * the boundary; PATH/HOME come from the image. SUPERSET_HOME_DIR points at
 * the read-only mounted container superset-home so the runtime-resolved
 * agent hooks find notify.sh.
 */
export function buildContainerTerminalEnv(
	params: ContainerTerminalEnvParams,
): Record<string, string> {
	const { ctx, hostAgentHookUrl, envPassthrough, hostEnv } = params;
	const env: Record<string, string> = {
		TERM: "xterm-256color",
		TERM_PROGRAM: TERMINAL_TERM_PROGRAM,
		TERM_PROGRAM_VERSION: TERMINAL_TERM_PROGRAM_VERSION,
		COLORTERM: "truecolor",
		COLORFGBG: ctx.themeType === "light" ? "0;15" : "15;0",
		TERM_THEME: ctx.themeType === "light" ? "light" : "dark",
		LANG: "C.UTF-8",
		SUPERSET_TERMINAL_ID: ctx.terminalId,
		SUPERSET_WORKSPACE_ID: ctx.workspaceId,
		SUPERSET_WORKSPACE_PATH: ctx.workspacePath,
		SUPERSET_ROOT_PATH: ctx.rootPath,
		SUPERSET_ENV:
			process.env.NODE_ENV === "development" ? "development" : "production",
		SUPERSET_AGENT_HOOK_VERSION: process.env.SUPERSET_AGENT_HOOK_VERSION || "",
		SUPERSET_HOME_DIR: CONTAINER_SUPERSET_DIR,
	};
	if (hostAgentHookUrl) {
		env.SUPERSET_HOST_AGENT_HOOK_URL = hostAgentHookUrl;
	}
	for (const name of envPassthrough) {
		const value = hostEnv[name];
		if (value !== undefined) env[name] = value;
	}
	return env;
}
