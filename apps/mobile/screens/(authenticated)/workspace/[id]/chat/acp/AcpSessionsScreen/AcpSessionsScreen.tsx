import type { SessionScopedState } from "@superset/session-protocol";
import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { createAcpSession, listAcpSessions } from "@/lib/host/client";
import { useHostRoutingKey } from "../../../hooks/useHostRoutingKey";

const STATUS_LABEL: Record<SessionScopedState["status"], string> = {
	starting: "Starting",
	idle: "Idle",
	running: "Running",
	awaiting_permission: "Needs permission",
	offline: "Ready to resume",
	// Dead sessions stay listed (read-only transcript) until the host's
	// graveyard evicts them — same wording as the thread's banner.
	dead: "Ended",
};

/**
 * Live (ACP) session list — a deliberate fork of ChatSessionsScreen rather
 * than a shared screen: the mastra chat list it forked from is slated for
 * removal once live sessions prove out, so the two lists stay independent
 * instead of one screen branching on session kind.
 *
 * The host's `list` response doubles as the capability probe
 * (SessionsPage.enabled): a host with the desktop toggle off answers with an
 * empty, disabled page, and this screen explains how to turn it on. Nothing
 * here runs until the user navigates in, so hosts with the feature off pay
 * zero background requests.
 */
export function AcpSessionsScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const routingKey = useHostRoutingKey(id);

	const [sessions, setSessions] = useState<SessionScopedState[] | null>(null);
	const [enabled, setEnabled] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!routingKey || !id) return;
		try {
			const page = await listAcpSessions(routingKey, id);
			setSessions(page.items);
			setEnabled(page.enabled);
			setError(null);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}, [routingKey, id]);

	useFocusEffect(
		useCallback(() => {
			void load();
		}, [load]),
	);

	const refresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await load();
		} finally {
			setRefreshing(false);
		}
	}, [load]);

	const createSession = useCallback(async () => {
		if (!routingKey || !id || creating) return;
		setCreating(true);
		try {
			const sessionId = Crypto.randomUUID();
			await createAcpSession(routingKey, { sessionId, workspaceId: id });
			router.push(`/(authenticated)/workspace/${id}/chat/acp/${sessionId}`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setCreating(false);
		}
	}, [routingKey, id, creating, router]);

	const loaded = sessions !== null;
	const rows = [...(sessions ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);

	return (
		<FlatList
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			data={rows}
			keyExtractor={(item) => item.sessionId}
			contentContainerClassName="p-4 pb-28 gap-2"
			refreshControl={
				<RefreshControl refreshing={refreshing} onRefresh={refresh} />
			}
			ListHeaderComponent={
				enabled || error ? (
					<View className="gap-2 pb-2">
						{enabled ? (
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
						{error ? (
							<Text className="text-destructive text-sm">{error}</Text>
						) : null}
					</View>
				) : null
			}
			ListEmptyComponent={
				loaded ? (
					<View className="items-center justify-center gap-2 px-6 py-20">
						<Text className="text-center text-muted-foreground">
							{enabled
								? "No live sessions yet"
								: "Live sessions are not available on this host. They require a canary build of the Superset desktop app."}
						</Text>
					</View>
				) : error ? null : (
					// First load still in flight — a blank screen reads as broken.
					// A failed first load renders its error in the header instead.
					<View className="items-center justify-center py-20">
						<ActivityIndicator />
					</View>
				)
			}
			renderItem={({ item }) => (
				<Pressable
					className="bg-card border-border active:bg-accent rounded-xl border p-4"
					onPress={() =>
						router.push(
							`/(authenticated)/workspace/${id}/chat/acp/${item.sessionId}`,
						)
					}
				>
					<Text className="font-medium" numberOfLines={1}>
						{item.title ?? "Live session"}
					</Text>
					<Text className="text-muted-foreground mt-1 text-xs">
						{`${STATUS_LABEL[item.status]} · ${new Date(item.updatedAt).toLocaleString()}`}
					</Text>
				</Pressable>
			)}
		/>
	);
}
