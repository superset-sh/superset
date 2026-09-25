import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { usePageComments, usePageCommentThreads } from "@superset/cloud-client";
import { i18n } from "@superset/i18n";
import { getInitials } from "@superset/shared/names";
import type { CommentIntent } from "@superset/shared/page-comments";
import {
	type CommentAnchor,
	type FrameMessage,
	type FrameRect,
	PENDING_ANCHOR_ID,
} from "@superset/shared/page-comments-runtime";
import * as Haptics from "expo-haptics";
import {
	Stack,
	useFocusEffect,
	useLocalSearchParams,
	useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { errorCopy } from "@/lib/errors";
import { PressableScale } from "@/screens/(authenticated)/components/PressableScale";
import { usePageQuery } from "../hooks/usePages";
import { CommentPin } from "./components/CommentPin";
import { CommentPopover } from "./components/CommentPopover";
import { PageFrame, type PageFrameHandle } from "./components/PageFrame";
import { usePageCommentUser } from "./hooks/usePageCommentUser";
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
	const [selection, setSelection] = useState<Selection | null>(null);
	const rememberPickRef = useRef<(anchor: CommentAnchor) => void>(() => {});
	const dismissSelectionRef = useRef<() => void>(() => {});
	const selectionRef = useRef(selection);
	selectionRef.current = selection;
	const submittingRef = useRef(false);
	const [rects, setRects] = useState<Record<string, FrameRect>>({});

	const page = usePageQuery(slug);
	const pageId = page.data?.id;
	const version = page.data?.version;
	const viewUrl = page.data?.viewUrl;
	const loaded = viewUrl !== undefined && loadedSrc === viewUrl;
	const frameFailed = viewUrl !== undefined && failedSrc === viewUrl;
	const offline = page.status === "pending" && page.fetchStatus === "paused";

	const { threads, refetch: refetchComments } = usePageCommentThreads({
		pageId: pageId ?? "",
		version: version ?? 0,
	});
	const setPick = usePageCommentStore((state) => state.setPick);
	const clearPick = usePageCommentStore((state) => state.clear);
	const setFocusThreadId = usePageCommentStore(
		(state) => state.setFocusThreadId,
	);
	const user = usePageCommentUser();
	const store = usePageComments({
		pageId: pageId ?? "",
		version: version ?? 0,
		user,
	});
	const [overlay, setOverlay] = useState<{
		width: number;
		height: number;
	} | null>(null);
	submittingRef.current = store.submitting;

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
			anchors: [
				...unresolvedThreads.flatMap((thread) =>
					thread.anchor ? [{ id: thread.id, anchor: thread.anchor }] : [],
				),
				...(selection
					? [{ id: PENDING_ANCHOR_ID, anchor: selection.anchor }]
					: []),
			],
		});
	}, [unresolvedThreads, selection, frameEpoch, send]);

	const selectionRect = selection
		? (rects[PENDING_ANCHOR_ID] ?? selection.rect)
		: null;

	useFocusEffect(
		useCallback(() => {
			setFrameEpoch((epoch) => epoch + 1);
			if (!usePageCommentStore.getState().anchor) setSelection(null);
			refetchComments();
		}, [refetchComments]),
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
		if (message.type === "pointer-down" && !submittingRef.current) {
			dismissSelectionRef.current();
		}
		if (message.type === "pick") {
			if (!selectionRef.current) {
				const next = { anchor: message.anchor, rect: message.rect };
				selectionRef.current = next;
				void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
				setSelection(next);
				rememberPickRef.current(message.anchor);
			}
		}
	}, []);

	const pins = useMemo(() => {
		const out: Array<{ id: string; point: { x: number; y: number } }> = [];
		for (const thread of unresolvedThreads) {
			const rect = rects[thread.id];
			if (rect && thread.anchor)
				out.push({ id: thread.id, point: pinPointOf(rect, thread.anchor) });
		}
		return out;
	}, [rects, unresolvedThreads]);

	const stackIndex = useMemo(() => stackPins(pins), [pins]);
	const pinPoints = useMemo(
		() => new Map(pins.map((pin) => [pin.id, pin.point])),
		[pins],
	);

	rememberPickRef.current = useCallback(
		(anchor: CommentAnchor) => {
			if (!pageId || !version) return;
			setPick({ pageId, version, anchor });
		},
		[pageId, setPick, version],
	);

	const openThread = useCallback(
		(threadId: string) => {
			void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			setFocusThreadId(threadId);
			router.push({
				pathname: "/(authenticated)/pages/[slug]/comments",
				params: { slug },
			});
		},
		[router, setFocusThreadId, slug],
	);

	const dismissSelection = useCallback(() => {
		setSelection(null);
		clearPick();
	}, [clearPick]);
	dismissSelectionRef.current = dismissSelection;

	const createAnchored = useCallback(
		async (body: string, intent?: CommentIntent) => {
			const anchor = selectionRef.current?.anchor;
			if (!anchor) return;
			await store.createThread({
				anchor,
				anchorText: anchor.text,
				body,
				...(intent ? { intent } : {}),
			});
			dismissSelection();
		},
		[dismissSelection, store],
	);

	const postQuick = useCallback(
		async (body: MessageDescriptor, intent: CommentIntent) => {
			if (store.submitting) return;
			try {
				await createAnchored(i18n._(body), intent);
			} catch (error) {
				Alert.alert(t({ message: "Comment not posted" }), errorCopy(error));
			}
		},
		[createAnchored, store.submitting, t],
	);

	const retryFrame = useCallback(async () => {
		setFailedSrc(null);
		setLoadedSrc(null);
		const next = await page.refetch();
		if (next.data?.viewUrl === viewUrl) frameRef.current?.reload();
	}, [page, viewUrl]);

	return (
		<View className="bg-background flex-1">
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
						setFocusThreadId(null);
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
						onLayout={(event) => {
							const { width, height } = event.nativeEvent.layout;
							setOverlay((previous) =>
								previous?.width === width && previous?.height === height
									? previous
									: { width, height },
							);
						}}
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
									onPress={() => openThread(thread.id)}
								/>
							);
						})}

						{selectionRect ? (
							<View
								pointerEvents="none"
								style={{
									left: selectionRect.left,
									top: selectionRect.top,
									width: selectionRect.width,
									height: selectionRect.height,
								}}
								className="absolute rounded-sm border border-blue-500 bg-blue-500/10"
							/>
						) : null}

						{selection && selectionRect && overlay ? (
							<CommentPopover
								rect={selectionRect}
								container={overlay}
								pending={store.submitting}
								onDismiss={dismissSelection}
								onOpenPresets={() =>
									router.push({
										pathname: "/(authenticated)/pages/[slug]/quick",
										params: { slug },
									})
								}
								onQuick={(body, intent) => void postQuick(body, intent)}
								onSubmit={(body) => createAnchored(body)}
							/>
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
