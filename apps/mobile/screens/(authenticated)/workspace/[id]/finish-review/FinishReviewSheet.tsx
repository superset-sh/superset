import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { createAcpSessionsApi } from "@/lib/host/client";
import { useStartWorkspaceChat } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useStartWorkspaceChat";
import { useHostAcpSessions } from "@/screens/(authenticated)/(home)/home/hooks/useHostAcpSessions";
import { buildSessionRows } from "@/screens/(authenticated)/(home)/home/utils/sessionRows";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import {
	type DraftComment,
	NO_COMMENTS,
	useDraftCommentsStore,
} from "../stores/draftCommentsStore";

function composeReviewPrompt(
	message: string,
	comments: DraftComment[],
): string {
	const parts: string[] = [];
	const trimmed = message.trim();
	if (trimmed) parts.push(trimmed);
	for (const comment of comments) {
		const anchor =
			comment.line > 0 ? `${comment.path}:${comment.line}` : comment.path;
		parts.push(
			comment.line > 0
				? `**${anchor}**\n\`\`\`\n${comment.lineText}\n\`\`\`\n${comment.body}`
				: `**${anchor}**\n${comment.body}`,
		);
	}
	return `Review feedback on the current changes:\n\n${parts.join("\n\n")}`;
}

export function FinishReviewSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const queryClient = useQueryClient();
	const workspaceId = id ?? "";

	const { workspace, host } = useWorkspaceHost(workspaceId || null);
	const { sessionsByWorkspace } = useHostAcpSessions(host);
	const comments = useDraftCommentsStore(
		(state) => state.commentsByWorkspace[workspaceId] ?? NO_COMMENTS,
	);
	const clearWorkspace = useDraftCommentsStore((state) => state.clearWorkspace);

	const widgetWorkspaces = useMemo<HostWorkspaceItem[]>(
		() => (workspace ? [{ ...workspace, hostReachable: true }] : []),
		[workspace],
	);
	const startWorkspaceChat = useStartWorkspaceChat(widgetWorkspaces);

	const sessionRows = useMemo(
		() =>
			buildSessionRows(
				workspaceId ? (sessionsByWorkspace.get(workspaceId) ?? []) : [],
			),
		[sessionsByWorkspace, workspaceId],
	);

	const [message, setMessage] = useState("");
	const [target, setTarget] = useState<"new" | string>("new");
	const [sending, setSending] = useState(false);

	const submit = async () => {
		if (!workspace || !host || comments.length === 0 || sending) return;
		const prompt = composeReviewPrompt(message, comments);
		setSending(true);
		try {
			if (target === "new") {
				startWorkspaceChat.mutate(
					{
						target: {
							workspaceId: workspace.id,
							workspaceName: workspace.name,
							branch: workspace.branch,
							hostId: workspace.hostId,
						},
						message: { text: prompt, attachments: [] },
					},
					{ onSuccess: () => clearWorkspace(workspaceId) },
				);
				router.back();
				return;
			}
			const routingKey = buildHostRoutingKey(
				host.organizationId,
				host.machineId,
			);
			await createAcpSessionsApi(routingKey).prompt({
				sessionId: target,
				prompt: [{ type: "text", text: prompt }],
			});
			clearWorkspace(workspaceId);
			void queryClient.invalidateQueries({
				queryKey: ["acp-sessions", "list"],
			});
			router.back();
			router.push(
				`/(authenticated)/workspace/${workspaceId}/chat/acp/${target}`,
			);
		} catch (cause) {
			Alert.alert(
				"Could not send review",
				cause instanceof Error ? cause.message : String(cause),
			);
		} finally {
			setSending(false);
		}
	};

	return (
		<>
			<Stack.Screen options={{ title: "Finish review" }} />
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					icon="xmark"
					accessibilityLabel="Close"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>
			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerClassName="pb-10 pt-2"
			>
				<Text className="text-muted-foreground px-4 pb-2 text-[12px]">
					Review message ·{" "}
					{comments.length === 1
						? "1 comment attached"
						: `${comments.length} comments attached`}
				</Text>
				<TextInput
					className="border-border text-foreground mx-3 min-h-20 rounded-xl border px-3.5 py-3 text-[15px]"
					multiline
					onChangeText={setMessage}
					placeholder="Leave a summary…"
					placeholderTextColor="#6b7280"
					value={message}
				/>
				<Text className="text-muted-foreground px-4 pb-2 pt-4 text-[12px]">
					Send to
				</Text>
				<TargetRow
					name="New agent session"
					subtitle="Starts a fresh session in this workspace"
					selected={target === "new"}
					onPress={() => setTarget("new")}
				/>
				{sessionRows.map((row) => (
					<TargetRow
						key={row.id}
						name={row.title}
						subtitle={row.status === "running" ? "Running" : "Idle"}
						selected={target === row.id}
						onPress={() => setTarget(row.id)}
					/>
				))}
				<PressableScale
					className={
						comments.length > 0 && !sending
							? "bg-primary mx-3 mt-4 items-center rounded-xl py-3"
							: "bg-primary/40 mx-3 mt-4 items-center rounded-xl py-3"
					}
					disabled={comments.length === 0 || sending}
					onPress={() => void submit()}
				>
					<Text className="text-primary-foreground font-semibold text-[15px]">
						{sending ? "Sending…" : "Send review"}
					</Text>
				</PressableScale>
			</ScrollView>
		</>
	);
}

function TargetRow({
	name,
	subtitle,
	selected,
	onPress,
}: {
	name: string;
	subtitle: string;
	selected: boolean;
	onPress: () => void;
}) {
	return (
		<PressableScale
			className={
				selected
					? "border-muted-foreground mx-3 mb-2 flex-row items-center gap-3 rounded-xl border px-3.5 py-3"
					: "border-border mx-3 mb-2 flex-row items-center gap-3 rounded-xl border px-3.5 py-3"
			}
			onPress={onPress}
		>
			<View
				className={
					selected
						? "bg-primary size-4.5 items-center justify-center rounded-full"
						: "border-border size-4.5 rounded-full border-2"
				}
			>
				{selected ? (
					<View className="bg-primary-foreground size-1.5 rounded-full" />
				) : null}
			</View>
			<View className="min-w-0 flex-1">
				<Text className="font-semibold text-[14px]" numberOfLines={1}>
					{name}
				</Text>
				<Text className="text-muted-foreground text-[11.5px]">{subtitle}</Text>
			</View>
		</PressableScale>
	);
}
