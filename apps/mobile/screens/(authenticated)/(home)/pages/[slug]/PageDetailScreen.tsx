import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { getInitials } from "@superset/shared/names";
import type {
	CommentAnchor,
	FrameMessage,
	FrameRect,
} from "@superset/shared/page-comments-runtime";
import * as Haptics from "expo-haptics";
import {
	Stack,
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { usePageQuery } from "../hooks/usePages";
import { CommentPin } from "./components/CommentPin";
import { PageFrame, type PageFrameHandle } from "./components/PageFrame";
import { SelectionToolbar } from "./components/SelectionToolbar";
import {
	toAnchoredThreads,
	usePageCommentActions,
	usePageCommentsQuery,
} from "./hooks/usePageComments";
import { usePageCommentStore } from "./stores/pageCommentStore";
import { pinPointOf, stackPins } from "./utils/pinLayout";

interface Selection {
	anchor: CommentAnchor;
	rect: FrameRect;
}

export function PageDetailScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const frameRef = useRef<PageFrameHandle>(null);

	const [loaded, setLoaded] = useState(false);
	// Bumped whenever the runtime announces itself, and whenever this screen is
	// focused again. The runtime emits rects from a requestAnimationFrame, which
	// iOS throttles while a sheet covers the WebView — anything sent under a
	// sheet is dropped, so the anchors have to be resent once it closes.
	const [frameEpoch, setFrameEpoch] = useState(0);
	const [commentMode, setCommentMode] = useState(false);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [rects, setRects] = useState<Record<string, FrameRect>>({});
	const [container, setContainer] = useState({ width: 0, height: 0 });

	const page = usePageQuery(slug);
	const pageId = page.data?.id;
	const version = page.data?.version;
	const comments = usePageCommentsQuery(pageId);
	const { createThread } = usePageCommentActions(pageId);
	const setPick = usePageCommentStore((state) => state.setPick);
	const setThreadId = usePageCommentStore((state) => state.setThreadId);

	const threads = useMemo(
		() => toAnchoredThreads(comments.data ?? []),
		[comments.data],
	);

	const send = useCallback(
		(message: Parameters<PageFrameHandle["send"]>[0]) =>
			frameRef.current?.send(message),
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch is a resend trigger, not a value read here
	useEffect(() => {
		send({ type: "set-mode", enabled: commentMode });
	}, [commentMode, frameEpoch, send]);

	// The runtime resolves anchors to live rects; without this the pins have
	// nowhere to sit. Resent whenever the thread set changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch resends the anchor set to a runtime that just restarted
	useEffect(() => {
		send({
			type: "track",
			anchors: threads.map((thread) => ({
				id: thread.id,
				anchor: thread.anchor,
			})),
		});
	}, [threads, frameEpoch, send]);

	// A comment posted from a sheet lands while this screen is covered; the
	// refetch and the resend both have to happen when it comes back.
	useFocusEffect(
		useCallback(() => {
			setFrameEpoch((epoch) => epoch + 1);
			void comments.refetch();
		}, [comments.refetch]),
	);

	const onFrameMessage = useCallback((message: FrameMessage) => {
		if (message.type === "ready") setFrameEpoch((epoch) => epoch + 1);
		if (message.type === "rects") {
			const next: Record<string, FrameRect> = {};
			for (const entry of message.entries) {
				if (entry.rect) next[entry.id] = entry.rect;
			}
			setRects(next);
		}
		if (message.type === "pointer-down") setSelection(null);
		if (message.type === "pick") {
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			setSelection({ anchor: message.anchor, rect: message.rect });
		}
	}, []);

	const pins = useMemo(() => {
		const out: Array<{ id: string; point: { x: number; y: number } }> = [];
		for (const thread of threads) {
			const rect = rects[thread.id];
			if (rect)
				out.push({ id: thread.id, point: pinPointOf(rect, thread.anchor) });
		}
		return out;
	}, [rects, threads]);

	const stackIndex = useMemo(() => stackPins(pins), [pins]);
	const pinPoints = useMemo(
		() => new Map(pins.map((pin) => [pin.id, pin.point])),
		[pins],
	);

	const postQuick = useCallback(
		async (body: MessageDescriptor) => {
			if (!selection || !pageId || !version) return;
			setSelection(null);
			try {
				await createThread.mutateAsync({
					version,
					anchor: selection.anchor,
					body: i18n._(body),
				});
			} catch {
				setSelection(selection);
			}
		},
		[createThread, pageId, selection, version],
	);

	const openSheet = useCallback(
		(route: "compose" | "quick") => {
			if (!selection || !pageId || !version) return;
			setPick({ pageId, version, anchor: selection.anchor });
			setSelection(null);
			router.push({
				pathname:
					route === "compose"
						? "/(authenticated)/(home)/pages/[slug]/compose"
						: "/(authenticated)/(home)/pages/[slug]/quick",
				params: { slug },
			});
		},
		[pageId, router, selection, setPick, slug, version],
	);

	const onLayout = useCallback((event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setContainer((previous) =>
			previous.width === width && previous.height === height
				? previous
				: { width, height },
		);
	}, []);

	const viewUrl = page.data?.viewUrl;

	return (
		<View className="bg-background flex-1" onLayout={onLayout}>
			<Stack.Screen
				options={{ title: page.data?.title ?? t({ message: "Page" }) }}
			/>

			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button
					icon={commentMode ? "viewfinder.circle.fill" : "viewfinder"}
					accessibilityLabel={
						commentMode
							? t({ message: "Leave comment mode" })
							: t({ message: "Comment on this page" })
					}
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						setSelection(null);
						setCommentMode((enabled) => !enabled);
					}}
				/>
				<Stack.Toolbar.Button
					icon="bubble.left.and.bubble.right"
					accessibilityLabel={t({ message: "Show all comments" })}
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push({
							pathname: "/(authenticated)/(home)/pages/[slug]/comments",
							params: { slug },
						});
					}}
				/>
			</Stack.Toolbar>

			{page.error ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="text-center font-medium">
						{t({ message: "This page could not be opened" })}
					</Text>
					<Text className="text-muted-foreground mt-1 text-center text-sm">
						{t({
							message:
								"It may have been deleted, or it belongs to another organization.",
						})}
					</Text>
				</View>
			) : null}

			{viewUrl ? (
				<View className="flex-1" style={{ opacity: loaded ? 1 : 0 }}>
					<PageFrame
						ref={frameRef}
						src={viewUrl}
						onMessage={onFrameMessage}
						onLoadEnd={() => {
							setLoaded(true);
							setFrameEpoch((epoch) => epoch + 1);
						}}
					/>

					<View className="absolute inset-0" pointerEvents="box-none">
						{threads.map((thread) => {
							const point = pinPoints.get(thread.id);
							if (!point) return null;
							return (
								<CommentPin
									key={thread.id}
									point={point}
									stackIndex={stackIndex[thread.id] ?? 0}
									initials={getInitials(thread.comments[0]?.authorName) || "?"}
									resolved={thread.resolved}
									active={false}
									onPress={() => {
										setThreadId(thread.id);
										router.push({
											pathname: "/(authenticated)/(home)/pages/[slug]/thread",
											params: { slug },
										});
									}}
								/>
							);
						})}

						{selection ? (
							<>
								<View
									pointerEvents="none"
									style={{
										left: selection.rect.left,
										top: selection.rect.top,
										width: selection.rect.width,
										height: selection.rect.height,
									}}
									className="absolute rounded-sm border border-blue-500 bg-blue-500/10"
								/>
								<SelectionToolbar
									rect={selection.rect}
									container={container}
									onComment={() => openSheet("compose")}
									onQuickMenu={() => openSheet("quick")}
									onQuick={(body) => void postQuick(body)}
									onDismiss={() => setSelection(null)}
								/>
							</>
						) : null}
					</View>

					{commentMode && !selection ? (
						<View
							pointerEvents="none"
							className="absolute inset-x-0 bottom-0 items-center pb-8"
						>
							<View className="bg-popover border-border rounded-full border px-3 py-1.5 shadow-md">
								<Text className="text-muted-foreground text-xs">
									{t({ message: "Tap anything on the page to comment on it" })}
								</Text>
							</View>
						</View>
					) : null}
				</View>
			) : null}

			{page.error || loaded ? null : (
				<View className="absolute inset-0 items-center justify-center">
					<Spinner className="size-5" />
				</View>
			)}
		</View>
	);
}
