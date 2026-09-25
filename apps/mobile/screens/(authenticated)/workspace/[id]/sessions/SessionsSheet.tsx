import { useLingui } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import {
	getHostTerminalsQueryKey,
	type TerminalRowData,
	useHostTerminals,
} from "@/screens/(authenticated)/(home)/home/hooks/useHostTerminals";
import { useTerminalTabOrderStore } from "@/screens/(authenticated)/stores/terminalTabOrderStore";
import { orderTerminalRows } from "../utils/orderTerminalRows";
import { SessionList } from "./components/SessionList";

/**
 * Bottom sheet behind the tab strip's list button: the same sessions the strip
 * shows, as a vertical list you can reorder by handle, switch to, or close.
 * Reordering lives here rather than in the strip because a 28pt chip inside a
 * horizontal scroller has no room for a drag that doesn't fight the scroll.
 */
export function SessionsSheet() {
	const { t } = useLingui();
	const params = useLocalSearchParams<{ id: string; active?: string }>();
	const id = params.id;
	const router = useRouter();
	const queryClient = useQueryClient();
	const { workspace, host } = useWorkspaceHost(id ?? null);
	const { terminalsByWorkspace } = useHostTerminals(host);
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;

	const savedOrder = useTerminalTabOrderStore((state) =>
		id ? state.orderByWorkspace[id] : undefined,
	);
	const setTabOrder = useTerminalTabOrderStore((state) => state.setTabOrder);
	const rows = useMemo(
		() =>
			orderTerminalRows(
				id ? (terminalsByWorkspace.get(id) ?? []) : [],
				savedOrder,
			),
		[terminalsByWorkspace, id, savedOrder],
	);

	const handleReorder = useCallback(
		(terminalIds: string[]) => {
			if (id) setTabOrder(id, terminalIds);
		},
		[id, setTabOrder],
	);

	const handleSelect = useCallback(
		(terminalId: string) => {
			if (terminalId !== params.active) {
				posthog.capture("session_switched", {
					workspace_id: id ?? null,
					source: "sessions_sheet",
				});
			}
			router.dismissTo(`/(authenticated)/workspace/${id}?tab=${terminalId}`);
		},
		[router, id, params.active],
	);

	const handleClose = useCallback(
		(row: TerminalRowData) => {
			Alert.alert(
				t({
					message: "Close session",
				}),
				row.title,
				[
					{
						text: t({ message: "Cancel" }),
						style: "cancel",
					},
					{
						text: t({ message: "Close" }),
						style: "destructive",
						onPress: () => {
							if (!workspace || !hostUrl) return;
							void getHostServiceClientByUrl(hostUrl)
								.terminal.killSession.mutate({
									terminalId: row.terminalId,
									workspaceId: workspace.id,
								})
								// `finally` alone doesn't consume the rejection: a failed kill
								// would close the alert and leave the session running silently.
								.catch(() =>
									Alert.alert(
										t({
											message: "Could not close session",
										}),
									),
								)
								.finally(() => {
									if (!host) return;
									void queryClient.invalidateQueries({
										queryKey: getHostTerminalsQueryKey(host.machineId),
									});
								});
						},
					},
				],
			);
		},
		[workspace, hostUrl, host, queryClient, t],
	);

	// The list is the sheet's ONLY layout child — the toolbar renders null.
	// A wrapping View plus a flex-1 child lays out at zero height on a
	// formSheet's cold mount (same trap CommitsSheet hit).
	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel={t({
						message: "Close",
					})}
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<SessionList
				rows={rows}
				activeTerminalId={params.active ?? null}
				onSelect={handleSelect}
				onReorder={handleReorder}
				onClose={handleClose}
			/>
		</>
	);
}
