import { useMemo } from "react";
import { useV2NotificationStore } from "renderer/stores/v2-notifications";
import type { PaneStatus } from "shared/tabs-types";
import { useTerminalAgentBindings } from "../useTerminalAgentBindings";
import { deriveTerminalAgentStatus } from "./deriveTerminalAgentStatus";

/**
 * Map of `terminalId → derived agent status` for a workspace. Runtime state
 * (working/permission/idle) comes from the host binding's `lastEventType`;
 * `review` means the host recorded a Stop newer than the locally persisted
 * seen timestamp. Terminals without a live binding are absent (treat as idle).
 */
export function useTerminalAgentStatuses(
	workspaceId: string,
	options?: { enabled?: boolean },
): Map<string, PaneStatus> {
	const bindings = useTerminalAgentBindings(workspaceId, options);
	const terminalSeenAt = useV2NotificationStore(
		(state) => state.terminalSeenAt,
	);

	return useMemo(() => {
		const map = new Map<string, PaneStatus>();
		for (const binding of bindings.values()) {
			map.set(
				binding.terminalId,
				deriveTerminalAgentStatus({
					lastEventType: binding.lastEventType,
					lastEventAt: binding.lastEventAt,
					lastSeenAt: terminalSeenAt[binding.terminalId],
				}),
			);
		}
		return map;
	}, [bindings, terminalSeenAt]);
}
