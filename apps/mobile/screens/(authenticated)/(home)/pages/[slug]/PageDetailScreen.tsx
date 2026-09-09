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

/**
 * The runtime re-posts every tracked rect once per animation frame while the
 * page scrolls, so a fresh object each time would re-render this screen — and
 * the frame under it — at 60fps for anchors that never moved.
 */
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

export function PageDetailScreen() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const frameRef = useRef<PageFrameHandle>(null);

	// Tracked per URL, not as a flag: a ticket that rolls over swaps `viewUrl`
	// for one that has not loaded yet, and a stale `true` would show the frame
	// blank with no spinner.
	const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
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
	const viewUrl = page.data?.viewUrl;
	const loaded = viewUrl !== undefined && loadedSrc === viewUrl;
	const frameFailed = viewUrl !== undefined && failedSrc === viewUrl;
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
			setRects((previous) => (sameRects(previous, next) ? previous : next));
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

	// An expired ticket is the likely failure, and only a fresh pull can mint
	// one — reloading the same URL would fail the same way.
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

					{/* Clipped, or a pin on an element scrolled out of view draws over
					    the navigation bar and stays tappable there. */}
					<View
						className="absolute inset-0 overflow-hidden"
						pointerEvents="box-none"
					>
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

			{page.error || frameFailed || loaded ? null : (
				<View className="absolute inset-0 items-center justify-center">
					<Spinner className="size-5" />
				</View>
			)}
		</View>
	);
}
