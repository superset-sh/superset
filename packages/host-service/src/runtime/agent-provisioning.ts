import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	getAgentSetupTemplatesDir,
	mcpHeadersHelperCommand,
	readInstalledPluginSources,
	readPluginConnections,
	reconcileMcpServers,
	setAgentSetupTemplatesDir,
	setupAgentIntegrations,
} from "@superset/agent-setup";
import { desiredPluginMcpServers } from "@superset/shared/plugins";

/**
 * Locates the agent-setup template assets for this deployment. The CLI
 * tarball copies them to lib/agent-templates next to the host-service bundle
 * (see packages/cli/scripts/build-dist.ts); an env override exists for
 * custom launchers, mirroring SUPERSET_PTY_DAEMON_SCRIPT_PATH. When running
 * from TS source neither exists and @superset/agent-setup falls back to its
 * in-repo templates.
 */
function resolveAgentTemplatesDir(): string | undefined {
	const fromEnv = process.env.SUPERSET_AGENT_TEMPLATES_DIR?.trim();
	if (fromEnv) return fromEnv;
	const sideBySide = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		"agent-templates",
	);
	return existsSync(sideBySide) ? sideBySide : undefined;
}

/**
 * Provisions agent lifecycle hooks (~/.superset/hooks/notify.sh + managed
 * entries in each agent's global config), PATH wrappers, and the zsh/bash
 * bootstrap files host-service's shell-launch path expects. The Electron app
 * does this at boot for hosts it spawns; a standalone (CLI-launched) host has
 * no other writer, which left headless hosts with no agent status at all
 * (#6254). Headless hosts have no per-agent disable setting, so every
 * supported agent is provisioned.
 */
export function provisionAgentIntegrations(): void {
	try {
		const templatesDir = resolveAgentTemplatesDir();
		if (templatesDir) setAgentSetupTemplatesDir(templatesDir);
		// Individual writers soft-fail on missing templates (each is
		// try/caught), which is exactly the silence that hid #6254 — surface a
		// broken install loudly instead of one warn per agent.
		const effectiveDir = getAgentSetupTemplatesDir();
		if (!existsSync(path.join(effectiveDir, "notify-hook.template.sh"))) {
			console.error(
				`[host-service] agent-setup templates missing at ${effectiveDir} — agent hooks will NOT work on this host. ` +
					"Reinstall the CLI or set SUPERSET_AGENT_TEMPLATES_DIR.",
			);
		}
		setupAgentIntegrations();

		// Plugin MCP entries converge here as well as at install time. An
		// install writes config only from the desktop process, so one made on
		// the web, from the CLI, or on a cloud box never reaches an agent
		// config; and a write can be declined when a same-named server is
		// configured elsewhere. This reads two files and does nothing when they
		// already agree, which is the usual case.
		const reports = reconcileMcpServers(
			desiredPluginMcpServers(readInstalledPluginSources() ?? [], {
				connections: readPluginConnections(),
				headersHelper: mcpHeadersHelperCommand(),
			}),
		);
		for (const report of reports) {
			if (report.wrote) {
				console.log(
					`[host-service] ${report.agent} MCP config updated: ${report.stale.join(", ")}`,
				);
			}
		}
	} catch (error) {
		console.warn(
			"[host-service] agent integration provisioning failed (continuing):",
			error,
		);
	}
}
