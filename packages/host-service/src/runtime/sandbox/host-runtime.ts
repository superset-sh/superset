import { resolveSupersetHomeDir } from "@superset/agent-setup/paths";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
	shellLaunchExpectsReadyMarker,
	waitForTerminalBaseEnv,
} from "../../terminal/env.ts";
import { resolveDefaultAccountTerminalEnv } from "../../trpc/router/usage/default-account.ts";
import type {
	PtyLaunchSpec,
	TerminalLaunchContext,
	WorkspaceRuntime,
} from "./workspace-runtime.ts";

/**
 * Build the host-service tRPC URL for the v2 agent hook. The agent shell
 * script POSTs to this; host-service fans out on the event bus so the
 * renderer (web or electron) can play the finish sound.
 */
export function getHostAgentHookUrl(): string {
	const port = process.env.HOST_SERVICE_PORT || process.env.PORT;
	if (!port) return "";
	return `http://127.0.0.1:${port}/trpc/notifications.hook`;
}

/**
 * Today's behavior: the PTY child is the user's shell running directly on
 * the host, wrapped with Superset's shell bootstrap (rc files under
 * SUPERSET_HOME_DIR) and the preserved login-shell env snapshot.
 */
export class HostRuntime implements WorkspaceRuntime {
	readonly kind = "host" as const;

	async prepare(): Promise<void> {
		// Nothing to provision for host execution.
	}

	async buildPtyLaunch(ctx: TerminalLaunchContext): Promise<PtyLaunchSpec> {
		// Use the preserved shell snapshot — never live process.env. Resolution
		// runs in the background at startup so the server can listen
		// immediately; wait for it here before the first PTY needs it.
		await waitForTerminalBaseEnv();
		const baseEnv = getTerminalBaseEnv();
		// Fallback matters for hosts not spawned by the desktop (CLI/systemd):
		// without it the wrapper paths, hook guard env, and shell bootstrap all
		// silently disable (#6254).
		const supersetHomeDir = resolveSupersetHomeDir();
		const shell = resolveLaunchShell(baseEnv);
		const argv = getShellLaunchArgs({ shell, supersetHomeDir });
		const env = {
			...buildV2TerminalEnv({
				baseEnv,
				shell,
				supersetHomeDir,
				organizationId: process.env.ORGANIZATION_ID || "",
				themeType: ctx.themeType,
				cwd: ctx.cwd,
				terminalId: ctx.terminalId,
				workspaceId: ctx.workspaceId,
				workspacePath: ctx.workspacePath,
				rootPath: ctx.rootPath,
				supersetEnv:
					process.env.NODE_ENV === "development" ? "development" : "production",
				agentHookPort: process.env.SUPERSET_AGENT_HOOK_PORT || "",
				agentHookVersion: process.env.SUPERSET_AGENT_HOOK_VERSION || "",
				hostAgentHookUrl: this.getAgentHookUrl(),
			}),
			// Usage-tab default account: provider CLIs typed or preset-launched in
			// this terminal run on the selected login. Baked at spawn as the fast
			// path; the agent wrappers re-resolve later switches at launch time.
			...resolveDefaultAccountTerminalEnv(ctx.db),
		};
		return {
			shell,
			argv,
			cwd: ctx.cwd,
			env,
			expectsReadyMarker: shellLaunchExpectsReadyMarker({
				shell,
				supersetHomeDir,
			}),
		};
	}

	getAgentHookUrl(): string {
		return getHostAgentHookUrl();
	}

	async destroy(): Promise<void> {
		// Nothing to tear down for host execution.
	}
}
