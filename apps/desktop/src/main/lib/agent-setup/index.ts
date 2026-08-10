import fs from "node:fs";
import {
	runSetupAction,
	setupDesktopAgentCapabilities,
	setupSingleAgent,
	teardownSingleAgent,
} from "./desktop-agent-setup";
import {
	BASH_DIR,
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_PLUGIN_DIR,
	ZSH_DIR,
} from "./paths";
import {
	createBashWrapper,
	createZshWrapper,
	getCommandShellArgs,
	getShellArgs,
	getShellEnv,
} from "./shell-wrappers";

/**
 * Provisions everything Superset manages in the user's environment for the
 * supported terminal agents: lifecycle hooks, binary wrappers, shell
 * integration, and the managed skills plugin. Agents in
 * `options.disabledAgentIds` get their global-config footprint removed
 * instead.
 */
export function setupAgentIntegrations(
	options: { disabledAgentIds?: readonly string[] } = {},
): void {
	console.log("[agent-setup] Provisioning agent integrations...");

	fs.mkdirSync(BIN_DIR, { recursive: true });
	fs.mkdirSync(HOOKS_DIR, { recursive: true });
	fs.mkdirSync(ZSH_DIR, { recursive: true });
	fs.mkdirSync(BASH_DIR, { recursive: true });
	fs.mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });

	setupDesktopAgentCapabilities(options);

	runSetupAction("zsh-wrapper", createZshWrapper);
	runSetupAction("bash-wrapper", createBashWrapper);

	console.log("[agent-setup] Agent integrations provisioned");
}

export function getSupersetBinDir(): string {
	return BIN_DIR;
}

export { setupSingleAgent, teardownSingleAgent };

export { getCommandShellArgs, getShellArgs, getShellEnv };
