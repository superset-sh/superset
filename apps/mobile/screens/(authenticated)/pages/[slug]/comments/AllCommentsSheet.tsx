import { Plural, useLingui } from "@lingui/react/macro";
import {
	type ServerThread,
	usePageComments,
	usePageCommentThreads,
} from "@superset/cloud-client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActionSheetIOS,
	Alert,
	Pressable,
	ScrollView,
	View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { usePageQuery } from "../../hooks/usePages";
import type { CommentComposerHandle } from "../components/CommentComposer";
import { CommentRow } from "../components/CommentRow";
import { usePageCommentUser } from "../hooks/usePageCommentUser";
import { usePageCommentStore } from "../stores/pageCommentStore";
import { ReplyBar } from "./components/ReplyBar";

const VISIBLE_REPLIES = 2;

interface ReplyTarget {
	threadId: string;
	name: string;
}

export function AllCommentsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const scrollRef = useRef<ScrollView>(null);
	const composerRef = useRef<CommentComposerHandle>(null);
	const threadY = useRef<Record<string, number>>({});
	const pendingScroll = useRef<string | "end" | null>(null);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [showResolved, setShowResolved] = useState(false);
	const [replyingTo, setReplyingTo] = useState<ReplyTarget | null>(null);
	const focusThreadId = usePageCommentStore((state) => state.focusThreadId);
	const setFocusThreadId = usePageCommentStore(
		(state) => state.setFocusThreadId,
	);

	const page = usePageQuery(slug);
	const user = usePageCommentUser();
	const pageId = page.data?.id ?? "";
	const version = page.data?.version ?? 0;
	const store = usePageComments({ pageId, version, user });
	const { rows: threads } = usePageCommentThreads({ pageId, version });

	const open = useMemo(() => threads.filter((row) => !row.resolved), [threads]);
	const resolved = useMemo(
		() => threads.filter((row) => row.resolved),
		[threads],
	);
	const visible = showResolved ? [...open, ...resolved] : open;

	const scrollToThread = useCallback((threadId: string) => {
		const y = threadY.current[threadId];
		if (y === undefined) return;
		scrollRef.current?.scrollTo({ y: Math.max(y - 8, 0), animated: true });
	}, []);

	useEffect(() => {
		if (!focusThreadId) return;
		const thread = threads.find((row) => row.id === focusThreadId);
		if (!thread) return;
		if (thread.resolved) setShowResolved(true);
		setExpanded((previous) => ({ ...previous, [thread.id]: true }));
		setReplyingTo({
			threadId: thread.id,
			name: thread.comments[0]?.authorName ?? "",
		});
		pendingScroll.current = thread.id;
		setFocusThreadId(null);
	}, [focusThreadId, threads, setFocusThreadId]);

	const startReply = (thread: ServerThread) => {
		setExpanded((previous) => ({ ...previous, [thread.id]: true }));
		setReplyingTo({
			threadId: thread.id,
			name: thread.comments[0]?.authorName ?? "",
		});
		scrollToThread(thread.id);
		composerRef.current?.focus();
	};

	const askResolve = (thread: ServerThread) => {
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: [
					thread.resolved
						? t({ message: "Reopen" })
						: t({ message: "Resolve" }),
					t({ message: "Cancel" }),
				],
				cancelButtonIndex: 1,
			},
			async (index) => {
				if (index !== 0) return;
				try {
					await store.setResolved(thread.id, !thread.resolved);
				} catch (error) {
					Alert.alert(
						thread.resolved
							? t({ message: "Could not reopen this comment" })
							: t({ message: "Could not resolve this comment" }),
						errorCopy(error),
					);
				}
			},
		);
	};

	const submit = async (body: string) => {
		if (replyingTo) {
			await store.addReply(replyingTo.threadId, body);
			setExpanded((previous) => ({ ...previous, [replyingTo.threadId]: true }));
			pendingScroll.current = replyingTo.threadId;
			setReplyingTo(null);
			return;
		}
		if (!pageId || version === 0) {
			throw new Error("This page is no longer open for comments");
		}
		await store.createThread({ body });
		pendingScroll.current = "end";
	};

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>

			<View className="bg-background flex-1">
				<ScrollView
					ref={scrollRef}
					className="flex-1"
					contentContainerClassName="px-4 pb-4 pt-1"
					contentInsetAdjustmentBehavior="automatic"
					keyboardShouldPersistTaps="handled"
					onContentSizeChange={() => {
						const target = pendingScroll.current;
						if (!target) return;
						pendingScroll.current = null;
						if (target === "end") {
							scrollRef.current?.scrollToEnd({ animated: true });
							return;
						}
						scrollToThread(target);
					}}
				>
					{visible.length === 0 ? (
						<View className="items-center justify-center px-8 py-24">
							<Text className="text-muted-foreground text-center">
								{t({ message: "No comments on this page yet" })}
							</Text>
							<Text className="text-muted-foreground/70 mt-1 text-center text-sm">
								{t({ message: "Say something, or tap a block to pin a note." })}
							</Text>
						</View>
					) : null}

					{visible.map((thread) => {
						const [root, ...replies] = thread.comments;
						if (!root) return null;
						const isExpanded = expanded[thread.id] ?? false;
						const shown = isExpanded
							? replies
							: replies.slice(0, VISIBLE_REPLIES);
						const hidden = replies.length - shown.length;

						return (
							<Pressable
								key={thread.id}
								accessibilityRole="button"
								accessibilityLabel={t({ message: "Comment options" })}
								onLongPress={() => askResolve(thread)}
								onLayout={(event) => {
									threadY.current[thread.id] = event.nativeEvent.layout.y;
								}}
								className={cn(
									thread.resolved && "opacity-50",
									replyingTo?.threadId === thread.id &&
										"bg-muted/40 rounded-lg",
								)}
							>
								<CommentRow comment={root} onReply={() => startReply(thread)} />

								{shown.map((reply) => (
									<CommentRow key={reply.id} comment={reply} indented />
								))}

								{hidden > 0 ? (
									<Pressable
										accessibilityRole="button"
										onPress={() =>
											setExpanded((previous) => ({
												...previous,
												[thread.id]: true,
											}))
										}
										hitSlop={8}
										className="self-start py-1 pl-11 active:opacity-60"
									>
										<Text className="text-muted-foreground text-xs font-medium">
											<Plural
												value={hidden}
												one="View # more reply"
												other="View # more replies"
											/>
										</Text>
									</Pressable>
								) : null}
							</Pressable>
						);
					})}

					{resolved.length > 0 ? (
						<Pressable
							accessibilityRole="button"
							onPress={() => setShowResolved((shown) => !shown)}
							hitSlop={8}
							className="self-start py-3 active:opacity-60"
						>
							<Text className="text-muted-foreground text-[13px] font-medium">
								{showResolved ? (
									t({ message: "Hide resolved comments" })
								) : (
									<Plural
										value={resolved.length}
										one="View # resolved comment"
										other="View # resolved comments"
									/>
								)}
							</Text>
						</Pressable>
					) : null}
				</ScrollView>

				<ReplyBar
					ref={composerRef}
					replyingTo={replyingTo?.name ?? null}
					pending={store.submitting}
					onCancelReply={() => setReplyingTo(null)}
					onSubmit={submit}
				/>
			</View>
		</>
	);
}
