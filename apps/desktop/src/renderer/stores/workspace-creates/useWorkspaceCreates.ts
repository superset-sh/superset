import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { authClient } from "renderer/lib/auth-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { addLaunchPanes } from "renderer/lib/workspace-pane-registry";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type InFlightEntry,
	useWorkspaceCreatesStore,
	type WorkspacesCreateInput,
} from "./store";

export interface SubmitArgs {
	hostId: string;
	snapshot: WorkspacesCreateInput;
}

export interface UseWorkspaceCreatesApi {
	entries: InFlightEntry[];
	submit: (args: SubmitArgs) => Promise<void>;
	retry: (workspaceId: string) => Promise<void>;
	dismiss: (workspaceId: string) => void;
}

export function useWorkspaceCreates(): UseWorkspaceCreatesApi {
	const entries = useWorkspaceCreatesStore((s) => s.entries);
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;

	const dispatch = useCallback(
		async (args: SubmitArgs) => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error(
					"workspaces.create requires `id` for in-flight tracking",
				);
			}
			if (!organizationId) {
				useWorkspaceCreatesStore
					.getState()
					.markError(workspaceId, "No active organization");
				return;
			}
			const hostUrl = resolveHostUrl({
				hostId: args.hostId,
				machineId,
				activeHostUrl,
				organizationId,
			});
			if (!hostUrl) {
				useWorkspaceCreatesStore
					.getState()
					.markError(workspaceId, "Host service not available");
				return;
			}
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				const result = await client.workspaces.create.mutate(args.snapshot);
				const launchPanes: Array<
					| { kind: "terminal"; terminalId: string; label?: string }
					| { kind: "chat"; chatSessionId: string; label?: string }
				> = [
					...result.terminals.map((entry) => ({
						kind: "terminal" as const,
						terminalId: entry.terminalId,
						label: entry.label,
					})),
					...result.agents
						.filter((entry) => entry.ok)
						.map((entry) => ({
							kind: "terminal" as const,
							terminalId: entry.sessionId,
							label: entry.label,
						})),
				];
				if (launchPanes.length > 0) {
					addLaunchPanes(result.workspace.id, launchPanes);
				}
				// Don't remove on success — the Manager removes the entry once the
				// v2Workspaces Electric collection has the matching id, closing the
				// gap between cloud confirmation and renderer collection update.
			} catch (err) {
				useWorkspaceCreatesStore
					.getState()
					.markError(
						workspaceId,
						err instanceof Error ? err.message : String(err),
					);
			}
		},
		[machineId, activeHostUrl, organizationId],
	);

	const submit = useCallback(
		async (args: SubmitArgs) => {
			const workspaceId = args.snapshot.id;
			if (!workspaceId) {
				throw new Error(
					"workspaces.create requires `id` for in-flight tracking",
				);
			}
			useWorkspaceCreatesStore.getState().add({
				hostId: args.hostId,
				snapshot: args.snapshot,
				state: "creating",
			});
			await dispatch(args);
		},
		[dispatch],
	);

	const retry = useCallback(
		async (workspaceId: string) => {
			const entry = useWorkspaceCreatesStore
				.getState()
				.entries.find((e) => e.snapshot.id === workspaceId);
			if (!entry) return;
			useWorkspaceCreatesStore.getState().markCreating(workspaceId);
			await dispatch({ hostId: entry.hostId, snapshot: entry.snapshot });
		},
		[dispatch],
	);

	const dismiss = useCallback((workspaceId: string) => {
		useWorkspaceCreatesStore.getState().remove(workspaceId);
	}, []);

	return { entries, submit, retry, dismiss };
}
