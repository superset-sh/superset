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
import { Alert, type LayoutChangeEvent, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
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

function sameRects(
	a: Record<string, FrameRect>,
	b: Record<string, FrameRect>,
): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => {
		const left = a[key];
		const right = b[key];
		return (
			right !== undefined &&
			left.top === right.top &&
			left.left === right.left &&
			left.width === right.width &&
			left.height === right.height
		);
	});
}

interface PageDetailScreenProps {
	presentation?: "full" | "sheet";
}

export function PageDetailScreen({
	presentation = "full",
}: PageDetailScreenProps = {}) {
	const { t } = useLingui();
	const router = useRouter();
	const { slug, scrollY } = useLocalSearchParams<{
		slug: string;
		scrollY?: string;
	}>();
	const frameRef = useRef<PageFrameHandle>(null);
	const scrollYRef = useRef(0);
	const restoredScroll = useRef(false);

	const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const [frameEpoch, setFrameEpoch] = useState(0);
	const [commentMode, setCommentMode] = useState(false);
	const [focused, setFocused] = useState(true);
	const [selection, setSelection] = useState<Selection | null>(null);
	const selectionRef = useRef(selection);
	selectionRef.current = selection;
	const [rects, setRects] = useState<Record<string, FrameRect>>({});
	const [container, setContainer] = useState({ width: 0, height: 0 });

	const page = usePageQuery(slug);
	const pageId = page.data?.id;
	const version = page.data?.version;
	const viewUrl = page.data?.viewUrl;
	const loaded = viewUrl !== undefined && loadedSrc === viewUrl;
	const frameFailed = viewUrl !== undefined && failedSrc === viewUrl;
	const offline = page.status === "pending" && page.fetchStatus === "paused";

	const comments = usePageCommentsQuery(pageId);
	const { createThread } = usePageCommentActions(pageId);
	const setPick = usePageCommentStore((state) => state.setPick);
	const setThreadId = usePageCommentStore((state) => state.setThreadId);

	const threads = useMemo(
		() => toAnchoredThreads(comments.data ?? []),
		[comments.data],
	);
	const unresolvedThreads = useMemo(
		() => threads.filter((thread) => !thread.resolved),
		[threads],
	);

	const send = useCallback(
		(message: Parameters<PageFrameHandle["send"]>[0]) =>
			frameRef.current?.send(message),
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch is a resend trigger, not a value read here
	useEffect(() => {
		send({
			type: "set-mode",
			enabled: commentMode,
			locked: selection !== null,
		});
	}, [commentMode, selection, frameEpoch, send]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: frameEpoch resends the anchor set to a runtime that just restarted
	useEffect(() => {
		send({
			type: "track",
			anchors: unresolvedThreads.map((thread) => ({
				id: thread.id,
				anchor: thread.anchor,
			})),
		});
	}, [unresolvedThreads, frameEpoch, send]);

	useFocusEffect(
		useCallback(() => {
			setFocused(true);
			setFrameEpoch((epoch) => epoch + 1);
			void comments.refetch();
			return () => setFocused(false);
		}, [comments.refetch]),
	);

	useEffect(() => {
		if (restoredScroll.current || !loaded) return;
		const y = Number(scrollY);
		if (!Number.isFinite(y) || y <= 0) return;
		restoredScroll.current = true;
		send({ type: "restore-scroll", y });
	}, [loaded, scrollY, send]);

	const onFrameMessage = useCallback((message: FrameMessage) => {
		if (message.type === "ready") setFrameEpoch((epoch) => epoch + 1);
		if (message.type === "scroll") scrollYRef.current = message.y;
		if (message.type === "rects") {
			const next: Record<string, FrameRect> = {};
			for (const entry of message.entries) {
				if (entry.rect) next[entry.id] = entry.rect;
			}
			setRects((previous) => (sameRects(previous, next) ? previous : next));
		}
		if (message.type === "pointer-down") setSelection(null);
		if (message.type === "pick") {
			if (!selectionRef.current) {
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			}
			setSelection(
				(previous) =>
					previous ?? { anchor: message.anchor, rect: message.rect },
			);
		}
	}, []);

	const pins = useMemo(() => {
		const out: Array<{ id: string; point: { x: number; y: number } }> = [];
		for (const thread of unresolvedThreads) {
			const rect = rects[thread.id];
			if (rect)
				out.push({ id: thread.id, point: pinPointOf(rect, thread.anchor) });
		}
		return out;
	}, [rects, unresolvedThreads]);

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
			} catch (error) {
				setSelection(selection);
				Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
			}
		},
		[createThread, pageId, selection, t, version],
	);

	const openSheet = useCallback(
		(route: "compose" | "quick") => {
			if (!selection || !pageId || !version) return;
			setPick({ pageId, version, anchor: selection.anchor });
			router.push({
				pathname:
					route === "compose"
						? "/(authenticated)/pages/[slug]/compose"
						: "/(authenticated)/pages/[slug]/quick",
				params: { slug },
			});
		},
		[pageId, router, selection, setPick, slug, version],
	);

	const retryFrame = useCallback(async () => {
		setFailedSrc(null);
		setLoadedSrc(null);
		const next = await page.refetch();
		if (next.data?.viewUrl === viewUrl) frameRef.current?.reload();
	}, [page, viewUrl]);

	const onLayout = useCallback((event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setContainer((previous) =>
			previous.width === width && previous.height === height
				? previous
				: { width, height },
		);
	}, []);

	return (
		<View className="bg-background flex-1" onLayout={onLayout}>
			<Stack.Screen
				options={{ title: page.data?.title ?? t({ message: "Page" }) }}
			/>

			{presentation === "sheet" ? (
				<Stack.Toolbar placement="left">
					<Stack.Toolbar.Button
						icon="xmark"
						accessibilityLabel={t({ message: "Close" })}
						onPress={() => router.back()}
					/>
				</Stack.Toolbar>
			) : null}

			<Stack.Toolbar placement="right">
				{presentation === "sheet" ? (
					<Stack.Toolbar.Button
						icon="arrow.up.left.and.arrow.down.right"
						accessibilityLabel={t({ message: "Open full screen" })}
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							router.replace({
								pathname: "/(authenticated)/pages/[slug]",
								params: { slug, scrollY: String(scrollYRef.current) },
							});
						}}
					/>
				) : null}
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
							pathname: "/(authenticated)/pages/[slug]/comments",
							params: { slug },
						});
					}}
				/>
				<Stack.Toolbar.Button
					icon="square.and.arrow.up"
					accessibilityLabel={t({ message: "Share this page" })}
					onPress={() => {
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						router.push({
							pathname: "/(authenticated)/pages/[slug]/share",
							params: { slug },
						});
					}}
				/>
			</Stack.Toolbar>

			{page.error || offline ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="text-center font-medium">
						{offline
							? t({ message: "You are offline" })
							: t({ message: "This page could not be opened" })}
					</Text>
					<Text className="text-muted-foreground mt-1 text-center text-sm">
						{offline
							? t({ message: "It will open once the connection is back." })
							: errorCopy(page.error)}
					</Text>
				</View>
			) : null}

			{viewUrl ? (
				<View
					className="flex-1"
					style={{ opacity: loaded && !frameFailed ? 1 : 0 }}
				>
					<PageFrame
						ref={frameRef}
						src={viewUrl}
						onMessage={onFrameMessage}
						onLoadEnd={() => {
							setLoadedSrc(viewUrl);
							setFrameEpoch((epoch) => epoch + 1);
						}}
						onError={() => setFailedSrc(viewUrl)}
					/>

					<View
						className="absolute inset-0 overflow-hidden"
						pointerEvents="box-none"
					>
						{unresolvedThreads.map((thread) => {
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
											pathname: "/(authenticated)/pages/[slug]/thread",
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
								{focused ? (
									<SelectionToolbar
										rect={selection.rect}
										container={container}
										onComment={() => openSheet("compose")}
										onQuickMenu={() => openSheet("quick")}
										onQuick={(body) => void postQuick(body)}
										onDismiss={() => setSelection(null)}
									/>
								) : null}
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

			{frameFailed ? (
				<View className="absolute inset-0 items-center justify-center px-8">
					<Text className="text-center font-medium">
						{t({ message: "This page could not be loaded" })}
					</Text>
					<Text className="text-muted-foreground mt-1 text-center text-sm">
						{t({
							message: "Check your connection, or try opening it again.",
						})}
					</Text>
					<PressableScale
						className="bg-primary mt-4 items-center rounded-xl px-5 py-2.5"
						onPress={() => void retryFrame()}
					>
						<Text className="text-primary-foreground font-semibold text-[15px]">
							{t({ message: "Try again" })}
						</Text>
					</PressableScale>
				</View>
			) : null}

			{page.error || offline || frameFailed || loaded ? null : (
				<View className="absolute inset-0 items-center justify-center">
					<Spinner className="size-5" />
				</View>
			)}
		</View>
	);
}
