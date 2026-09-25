import { Plural, useLingui } from "@lingui/react/macro";
import {
	type ServerThread,
	usePageComments,
	usePageCommentThreads,
} from "@superset/cloud-client";
import { Stack, useGlobalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
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
	excerpt: string;
}

type PendingScroll = "end" | { threadId: string; atBottom: boolean };

export function AllCommentsSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useGlobalSearchParams<{ slug: string }>();
	const scrollRef = useRef<ScrollView>(null);
	const composerRef = useRef<CommentComposerHandle>(null);
	const threadLayout = useRef<Record<string, { y: number; height: number }>>(
		{},
	);
	const viewportHeight = useRef(0);
	const pendingScroll = useRef<PendingScroll | null>(null);
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
	const {
		rows: threads,
		error: threadsError,
		refetch: refetchThreads,
	} = usePageCommentThreads({ pageId, version });
	const loadError = page.error ?? threadsError;
	const loading = !loadError && (!pageId || version === 0);

	const open = useMemo(() => threads.filter((row) => !row.resolved), [threads]);
	const resolved = useMemo(
		() => threads.filter((row) => row.resolved),
		[threads],
	);
	const visible = showResolved ? [...open, ...resolved] : open;

	const scrollToThread = useCallback((threadId: string, atBottom = false) => {
		const layout = threadLayout.current[threadId];
		if (!layout) return;
		const y = atBottom
			? layout.y + layout.height + 8 - viewportHeight.current
			: layout.y - 8;
		scrollRef.current?.scrollTo({ y: Math.max(y, 0), animated: true });
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
			excerpt: thread.comments[0]?.body ?? "",
		});
		pendingScroll.current = { threadId: thread.id, atBottom: false };
		setFocusThreadId(null);
	}, [focusThreadId, threads, setFocusThreadId]);

	const startReply = (thread: ServerThread) => {
		setExpanded((previous) => ({ ...previous, [thread.id]: true }));
		setReplyingTo({
			threadId: thread.id,
			name: thread.comments[0]?.authorName ?? "",
			excerpt: thread.comments[0]?.body ?? "",
		});
		scrollToThread(thread.id);
		composerRef.current?.focus();
	};

	const toggleResolved = async (thread: ServerThread) => {
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
	};

	const submit = async (body: string) => {
		if (!replyingTo) return;
		const { threadId } = replyingTo;
		setExpanded((previous) => ({ ...previous, [threadId]: true }));
		pendingScroll.current = { threadId, atBottom: true };
		try {
			await store.addReply(threadId, body);
		} catch (error) {
			pendingScroll.current = null;
			throw error;
		}
		// Closing the bar unmounts the composer holding the draft, so it can
		// only happen once the reply is actually in.
		setReplyingTo(null);
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

			<ScrollView
				ref={scrollRef}
				className="bg-background flex-1"
				contentContainerClassName="px-4 pb-4 pt-1"
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				onLayout={(event) => {
					viewportHeight.current = event.nativeEvent.layout.height;
				}}
				onContentSizeChange={() => {
					const target = pendingScroll.current;
					if (!target) return;
					pendingScroll.current = null;
					if (target === "end") {
						scrollRef.current?.scrollToEnd({ animated: true });
						return;
					}
					scrollToThread(target.threadId, target.atBottom);
				}}
			>
				{loadError ? (
					<View className="items-center justify-center px-8 py-24">
						<Text className="text-center font-medium">
							{t({ message: "Comments could not be loaded" })}
						</Text>
						<Text className="text-muted-foreground mt-1 text-center text-sm">
							{errorCopy(loadError)}
						</Text>
						<Pressable
							accessibilityRole="button"
							onPress={() => refetchThreads()}
							hitSlop={8}
							className="mt-3 active:opacity-60"
						>
							<Text className="text-[13px] font-medium">
								{t({ message: "Try again" })}
							</Text>
						</Pressable>
					</View>
				) : null}

				{loading ? (
					<View className="items-center justify-center py-24">
						<Spinner className="size-5" />
					</View>
				) : null}

				{!loadError && !loading && visible.length === 0 ? (
					<View className="items-center justify-center px-8 py-24">
						<Text className="text-muted-foreground text-center">
							{t({ message: "No comments on this page yet" })}
						</Text>
						<Text className="text-muted-foreground/70 mt-1 text-center text-sm">
							{t({ message: "Tap anything on the page to comment on it" })}
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
						<View
							key={thread.id}
							onLayout={(event) => {
								const { y, height } = event.nativeEvent.layout;
								threadLayout.current[thread.id] = { y, height };
							}}
							className={cn(
								"bg-foreground/5 -mx-2 mb-2 rounded-2xl px-3 py-1",
								thread.resolved && "opacity-50",
								replyingTo?.threadId === thread.id && "bg-foreground/10",
							)}
						>
							<CommentRow
								comment={root}
								resolved={thread.resolved}
								onReply={() => startReply(thread)}
								onToggleResolved={() => void toggleResolved(thread)}
							/>

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
						</View>
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

			{replyingTo ? (
				<ReplyBar
					ref={composerRef}
					replyingTo={replyingTo.name}
					excerpt={replyingTo.excerpt}
					pending={store.submitting}
					onCancelReply={() => setReplyingTo(null)}
					onSubmit={submit}
				/>
			) : null}
		</>
	);
}
