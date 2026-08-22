import fs from "node:fs";
import {
	runSetupAction,
	setupAgentCapabilities,
	setupSingleAgent,
	teardownSingleAgent,
} from "./agent-setup";
import { resolveDisabledAgentIds } from "./disabled-agent-hooks";
import {
	getBashDir,
	getBinDir,
	getHooksDir,
	getOpenCodePluginDir,
	getZshDir,
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
 * instead. Runs on every host that serves terminals — the Electron main
 * process and the standalone (CLI-launched) host-service alike.
 *
 * Callers without their own settings store (headless hosts) omit
 * `disabledAgentIds`; the shared ~/.superset/agent-hooks.json mirror and the
 * SUPERSET_DISABLED_AGENT_HOOKS env override apply instead, so a machine
 * running both the desktop and CLI hosts converges on one disable set.
 */
export function setupAgentIntegrations(
	options: { disabledAgentIds?: readonly string[] } = {},
): void {
	console.log("[agent-setup] Provisioning agent integrations...");
	const disabledAgentIds = resolveDisabledAgentIds(options.disabledAgentIds);

	fs.mkdirSync(getBinDir(), { recursive: true });
	fs.mkdirSync(getHooksDir(), { recursive: true });
	fs.mkdirSync(getZshDir(), { recursive: true });
	fs.mkdirSync(getBashDir(), { recursive: true });
	fs.mkdirSync(getOpenCodePluginDir(), { recursive: true });

	setupAgentCapabilities({ disabledAgentIds });

	runSetupAction("zsh-wrapper", createZshWrapper);
	runSetupAction("bash-wrapper", createBashWrapper);

	console.log("[agent-setup] Agent integrations provisioned");
}

export { setupSingleAgent, teardownSingleAgent };

export {
	ensureClaudeManagedHooksAt,
	ensureCodexManagedHooksAt,
} from "./agent-wrappers-claude-codex-opencode";
export {
	type ProfileProvisionReport,
	provisionClaudeProfile,
	provisionCodexProfile,
} from "./provider-profiles";

export { getCommandShellArgs, getShellArgs, getShellEnv };

export {
	getAgentSetupTemplatesDir,
	setAgentSetupTemplatesDir,
} from "./config";
export {
	readSharedDisabledAgentIds,
	writeSharedDisabledAgentIds,
} from "./disabled-agent-hooks";
export {
	readExternallyConfiguredMcpServers,
	type SyncManagedMcpServersOptions,
	syncManagedMcpServers,
} from "./managed-mcp-servers";
export { getBinDir, resolveSupersetHomeDir } from "./paths";
