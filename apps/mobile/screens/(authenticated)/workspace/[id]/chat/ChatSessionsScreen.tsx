import { useLiveQuery } from "@tanstack/react-db";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";
import { WorkspaceBackButton } from "@/screens/(authenticated)/workspace/[id]/components/WorkspaceBackButton";
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
type Row = ChatRow | TerminalRow;

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

	// One unified, active-session list per workspace, newest activity first.
	// Chat sessions are navigable; terminal sessions are mixed in but read-only
	// (no remote history/messaging) — distinguished by a "Terminal" tag.
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
