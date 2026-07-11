import { useLiveQuery } from "@tanstack/react-db";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { WorkspaceBackButton } from "@/screens/(authenticated)/workspace/[id]/components/WorkspaceBackButton";
import { useWorkspaceClaudeSessions } from "./hooks/useWorkspaceClaudeSessions";
import { useWorkspaceTerminalAgents } from "./hooks/useWorkspaceTerminalAgents";

type ChatRow = { kind: "chat"; id: string; title: string; ts: number };
type TerminalRow = {
	kind: "terminal";
	id: string;
	label: string;
	status: string;
	needsInput: boolean;
	ts: number;
};
type ClaudeRow = {
	kind: "claude";
	id: string;
	model: string | null;
	status: string;
	ts: number;
};
type Row = ChatRow | TerminalRow | ClaudeRow;

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

	const { data: sessions, isReady: sessionsReady } = useLiveQuery(
		(q) => q.from({ chatSessions: collections.chatSessions }),
		[collections],
	);
	const { rows: terminalRows } = useWorkspaceTerminalAgents(id);
	const {
		sessions: claudeSessions,
		hostOnline: claudeHostOnline,
		sessionsReady: claudeSessionsReady,
	} = useWorkspaceClaudeSessions(id);
	const liveClaudeIds = new Set(
		claudeSessions.map((session) => session.sessionId),
	);

	const createClaudeSession = () => {
		if (!claudeHostOnline) return;
		const sessionId = randomUUID();
		router.push(`/(authenticated)/workspace/${id}/claude/${sessionId}`);
	};

	// One unified, active-session list per workspace, newest activity first.
	// Chat sessions are navigable; terminal sessions are mixed in but read-only
	// (no remote history/messaging) — distinguished by a "Terminal" tag.
	const rows: Row[] = [
		...(sessions ?? [])
			.filter((s) => s.v2WorkspaceId === id && !liveClaudeIds.has(s.id))
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
		...claudeSessions.map<Row>((session) => ({
			kind: "claude",
			id: session.sessionId,
			model: session.model,
			status: session.status,
			ts: session.updatedAt,
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
				ListHeaderComponent={
					<View
						testID={
							claudeSessionsReady ? "claude-session-list-ready" : undefined
						}
					>
						<Pressable
							className="bg-primary/10 border-primary/30 active:bg-primary/20 mb-2 rounded-xl border p-4"
							disabled={!claudeHostOnline}
							onPress={createClaudeSession}
							testID="claude-session-create"
						>
							<Text className="text-primary font-medium">
								New Claude SDK session
							</Text>
							<Text className="text-muted-foreground mt-1 text-xs">
								{claudeHostOnline
									? "Direct Claude Agent SDK on this workspace's host"
									: "Host must be online"}
							</Text>
						</Pressable>
					</View>
				}
				ListEmptyComponent={
					sessionsReady && claudeSessionsReady ? (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								No sessions yet
							</Text>
						</View>
					) : null
				}
				renderItem={({ item }) =>
					item.kind === "chat" ? (
						<Pressable
							className="bg-card border-border active:bg-accent rounded-xl border p-4"
							onPress={() =>
								router.push(`/(authenticated)/workspace/${id}/chat/${item.id}`)
							}
						>
							<Text className="font-medium" numberOfLines={1}>
								{item.title}
							</Text>
							<Text className="text-muted-foreground mt-1 text-xs">
								{new Date(item.ts).toLocaleString()}
							</Text>
						</Pressable>
					) : item.kind === "claude" ? (
						<Pressable
							className="bg-card border-border active:bg-accent rounded-xl border p-4"
							onPress={() =>
								router.push(
									`/(authenticated)/workspace/${id}/claude/${item.id}`,
								)
							}
							testID={`claude-session-row-${item.id}`}
						>
							<View className="flex-row items-center gap-2">
								<Text className="font-medium" numberOfLines={1}>
									{item.model ?? "Claude SDK session"}
								</Text>
								<View className="bg-primary/15 rounded-full px-2 py-0.5">
									<Text className="text-primary text-[10px] uppercase">
										SDK
									</Text>
								</View>
							</View>
							<Text className="text-muted-foreground mt-1 text-xs">
								{item.status} · {new Date(item.ts).toLocaleString()}
							</Text>
						</Pressable>
					) : (
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
					)
				}
			/>
		</>
	);
}
