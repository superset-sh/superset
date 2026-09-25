import {
	type ActiveAgentStatus,
	agentStatusFromEvent,
	highestAgentStatus,
} from "@superset/shared/agent-status";
import type { TerminalAgentStore } from "../../terminal-agents/store";

const SETTLE_MS = 2_000;
const MIN_INTERVAL_MS = 5_000;

// A box is one workspace, so every binding on it counts.
export function startSandboxAgentStatusReporter(args: {
	apiUrl: string;
	workspaceId: string;
	hostSecret: string;
	store: TerminalAgentStore;
}): () => void {
	let lastSent: ActiveAgentStatus | null | undefined;
	let lastSentAt = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const current = (): ActiveAgentStatus | null =>
		highestAgentStatus(
			args.store
				.list()
				.map((binding) => agentStatusFromEvent(binding.lastEventType)),
		);

	const send = async () => {
		timer = null;
		const status = current();
		if (status === lastSent) return;
		lastSent = status;
		lastSentAt = Date.now();
		try {
			const response = await fetch(
				`${args.apiUrl}/api/cloud-workspaces/${args.workspaceId}/agent-status`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${args.hostSecret}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ status, at: lastSentAt }),
					signal: AbortSignal.timeout(10_000),
				},
			);
			if (!response.ok) throw new Error(`answered ${response.status}`);
		} catch (error) {
			console.warn(
				"[sandbox-agent-status] report failed:",
				error instanceof Error ? error.message : error,
			);
			lastSent = undefined;
		}
	};

	const schedule = () => {
		if (timer) return;
		const wait = Math.max(
			SETTLE_MS,
			MIN_INTERVAL_MS - (Date.now() - lastSentAt),
		);
		timer = setTimeout(() => void send(), wait);
	};

	args.store.on("change", schedule);
	schedule();
	return () => {
		args.store.off("change", schedule);
		if (timer) clearTimeout(timer);
	};
}
