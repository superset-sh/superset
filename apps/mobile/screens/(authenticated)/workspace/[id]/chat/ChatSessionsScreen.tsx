import type { SessionScopedState } from "@superset/session-protocol";
import { useLiveQuery } from "@tanstack/react-db";
import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { Text } from "@/components/ui/text";
import { createAcpSession, listAcpSessions } from "@/lib/host/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { WorkspaceBackButton } from "@/screens/(authenticated)/workspace/[id]/components/WorkspaceBackButton";
import { useHostRoutingKey } from "../hooks/useHostRoutingKey";
import { useWorkspaceTerminalAgents } from "./hooks/useWorkspaceTerminalAgents";

const ACP_STATUS_LABEL: Record<SessionScopedState["status"], string> = {
	starting: "Starting",
	idle: "Idle",
	running: "Running",
	awaiting_permission: "Needs permission",
	// Dead sessions stay listed (read-only transcript) until the host's
	// graveyard evicts them — same wording as the thread's banner.
	dead: "Ended",
};

type ChatRow = { kind: "chat"; id: string; title: string; ts: number };
type TerminalRow = {
	kind: "terminal";
	id: string;
	label: string;
	status: string;
	needsInput: boolean;
	ts: number;
};
type AcpRow = {
	kind: "acp";
	id: string;
	title: string | null;
	status: SessionScopedState["status"];
	ts: number;
};
type Row = ChatRow | TerminalRow | AcpRow;

function toMs(
	value: Date | null | undefined,
	fallback: Date | null | undefined,
): number {
	const d = value ?? fallback;
	return d ? d.getTime() : 0;
}

export function ChatSessionsScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const collections = useCollections();
	const routingKey = useHostRoutingKey(id);

	const { data: sessions, isReady: sessionsReady } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);
	const { rows: terminalRows } = useWorkspaceTerminalAgents(id);

	const [acpSessions, setAcpSessions] = useState<SessionScopedState[] | null>(
		null,
	);
	// Off until the host says otherwise: `list` doubles as the capability
	// probe (SessionsPage.enabled), so a host with the desktop toggle off
	// costs zero extra requests and shows zero ACP UI.
	const [acpEnabled, setAcpEnabled] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [creating, setCreating] = useState(false);
	const [acpError, setAcpError] = useState<string | null>(null);

	const loadAcp = useCallback(async () => {
		if (!routingKey || !id) return;
		try {
			const page = await listAcpSessions(routingKey, id);
			setAcpSessions(page.items);
			setAcpEnabled(page.enabled);
			setAcpError(null);
		} catch (cause) {
			setAcpError(cause instanceof Error ? cause.message : String(cause));
		}
	}, [routingKey, id]);

	useFocusEffect(
		useCallback(() => {
			void loadAcp();
		}, [loadAcp]),
	);

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await loadAcp();
		} finally {
			setRefreshing(false);
		}
	}, [loadAcp]);

	const createSession = useCallback(async () => {
		if (!routingKey || !id || creating) return;
		setCreating(true);
		try {
			const sessionId = Crypto.randomUUID();
			await createAcpSession(routingKey, { sessionId, workspaceId: id });
			router.push(`/(authenticated)/workspace/${id}/chat/acp/${sessionId}`);
		} catch (cause) {
			setAcpError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setCreating(false);
		}
	}, [routingKey, id, creating, router]);

	// One unified, active-session list per workspace, newest activity first.
	// Chat sessions and ACP live sessions are navigable; terminal sessions are
	// mixed in but read-only (no remote history/messaging) — distinguished by a
	// "Terminal" tag.
	const rows: Row[] = [
		...(sessions ?? [])
			.filter((s) => s.v2WorkspaceId === id)
			.map<Row>((s) => ({
				kind: "chat",
				id: s.id,
				title: s.title ?? "Untitled chat",
				ts: toMs(s.updatedAt, s.createdAt),
			})),
		...terminalRows.map<Row>((t) => ({
			kind: "terminal",
			id: t.terminalId,
			label: t.label,
			status: t.status,
			needsInput: t.needsInput,
			ts: t.sortKey,
		})),
		...(acpSessions ?? []).map<Row>((s) => ({
			kind: "acp",
			id: s.sessionId,
			title: s.title,
			status: s.status,
			ts: s.updatedAt,
		})),
	].sort((a, b) => b.ts - a.ts);

	return (
		<>
			<WorkspaceBackButton />
			<FlatList
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				data={rows}
				keyExtractor={(item) => `${item.kind}:${item.id}`}
				contentContainerClassName="p-4 pb-28 gap-2"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={refresh} />
				}
				ListHeaderComponent={
					acpEnabled || acpError ? (
						<View className="gap-2 pb-2">
							{acpEnabled ? (
								<Pressable
									className="bg-primary active:opacity-80 items-center rounded-xl p-4"
									disabled={creating || !routingKey}
									onPress={createSession}
								>
									<Text className="text-primary-foreground font-medium">
										{creating ? "Starting session…" : "New live session"}
									</Text>
								</Pressable>
							) : null}
							{acpError ? (
								<Text className="text-destructive text-sm">{acpError}</Text>
							) : null}
						</View>
					) : null
				}
				ListEmptyComponent={
					sessionsReady ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								No sessions yet
							</Text>
						</View>
					) : null
				}
				renderItem={({ item }) =>
					item.kind === "terminal" ? (
						<View className="bg-card/40 border-border/70 flex-row items-center gap-3 rounded-xl border p-4">
							<View className="flex-1">
								<View className="flex-row items-center gap-2">
									<Text className="font-medium" numberOfLines={1}>
										{item.label}
									</Text>
									<View className="bg-muted rounded-full px-2 py-0.5">
										<Text className="text-muted-foreground text-[10px] uppercase">
											Terminal
										</Text>
									</View>
								</View>
								<Text className="text-muted-foreground mt-1 text-xs">
									{new Date(item.ts).toLocaleString()}
								</Text>
							</View>
							<View
								className={
									item.needsInput
										? "bg-primary/15 rounded-full px-2 py-1"
										: "bg-muted rounded-full px-2 py-1"
								}
							>
								<Text
									className={
										item.needsInput
											? "text-primary text-xs font-medium"
											: "text-muted-foreground text-xs"
									}
								>
									{item.status}
								</Text>
							</View>
						</View>
					) : (
						<Pressable
							className="bg-card border-border active:bg-accent rounded-xl border p-4"
							onPress={() =>
								router.push(
									item.kind === "chat"
										? `/(authenticated)/workspace/${id}/chat/${item.id}`
										: `/(authenticated)/workspace/${id}/chat/acp/${item.id}`,
								)
							}
						>
							<Text className="font-medium" numberOfLines={1}>
								{item.kind === "chat"
									? item.title
									: (item.title ?? "Live session")}
							</Text>
							<Text className="text-muted-foreground mt-1 text-xs">
								{item.kind === "acp"
									? `${ACP_STATUS_LABEL[item.status]} · ${new Date(item.ts).toLocaleString()}`
									: new Date(item.ts).toLocaleString()}
							</Text>
						</Pressable>
					)
				}
			/>
		</>
	);
}
