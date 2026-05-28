import type { CreatePaneInput, WorkspaceStore } from "@superset/panes";
import {
	type AgentLaunchConfig,
	getAgentCommandText,
} from "renderer/lib/agent-launch-command";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { TerminalLauncher } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2TerminalLauncher";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type { StoreApi } from "zustand/vanilla";

export type AgentSessionPlacement = "split-pane" | "new-tab";

interface CreateAgentSessionInput {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
	hostUrl: string;
	workspaceId: string;
	config: AgentLaunchConfig;
	placement: AgentSessionPlacement;
	cwd?: string;
	titleOverride?: string;
	/** How long to poll for the host-service agent binding before giving up
	 * and letting writeInput proceed anyway. Tuned to cover the common CLI
	 * agent startup (sub-3s for Claude/Codex on a warm machine). */
	waitForReady?: { timeoutMs: number; pollMs: number };
}

export interface CreateAgentSessionResult {
	terminalId: string;
	bound: boolean;
}

/**
 * Spawn a fresh terminal running the given agent config, register the
 * pane in the workspace store, and best-effort wait for the agent's
 * first hook event so a follow-up writeInput lands on the running agent
 * instead of the launching shell. Designed to be reusable across diff
 * comments, file-viewer selections, chat actions, etc.
 *
 * On wait timeout this still resolves (with `bound: false`) so callers
 * can decide whether to write input anyway — desktop pty buffers input
 * either way.
 */
export async function createAgentSession({
	store,
	launcher,
	hostUrl,
	workspaceId,
	config,
	placement,
	cwd,
	titleOverride,
	waitForReady = { timeoutMs: 10_000, pollMs: 400 },
}: CreateAgentSessionInput): Promise<CreateAgentSessionResult> {
	const command = getAgentCommandText(config);
	const terminalId = await launcher.create({ command, cwd });

	const state = store.getState();
	const pane: CreatePaneInput<PaneViewerData> = {
		kind: "terminal",
		titleOverride,
		data: { terminalId } as TerminalPaneData,
	};
	if (placement === "split-pane" && state.activeTabId) {
		state.addPane({ tabId: state.activeTabId, pane });
	} else {
		state.addTab({ panes: [pane] });
	}

	const bound = await waitForAgentBinding({
		hostUrl,
		workspaceId,
		terminalId,
		timeoutMs: waitForReady.timeoutMs,
		pollMs: waitForReady.pollMs,
	});
	return { terminalId, bound };
}

async function waitForAgentBinding({
	hostUrl,
	workspaceId,
	terminalId,
	timeoutMs,
	pollMs,
}: {
	hostUrl: string;
	workspaceId: string;
	terminalId: string;
	timeoutMs: number;
	pollMs: number;
}): Promise<boolean> {
	const client = getHostServiceClientByUrl(hostUrl);
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const bindings = await client.terminalAgents.listByWorkspace.query({
				workspaceId,
			});
			if (bindings.some((binding) => binding.terminalId === terminalId)) {
				return true;
			}
		} catch {
			// Swallow — best-effort poll. Host may be momentarily unreachable.
		}
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
	return false;
}
