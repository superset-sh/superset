import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import type {
	TimelineItem,
	TimelineToolCall,
	TimelineToolCallItem,
} from "@superset/host-service-sync/timeline";
import { ChevronRightIcon, WrenchIcon, XIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useDerivedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { PermissionRequestView } from "../../../PermissionRequestView";
import type { RespondToPermission } from "../../TimelineItemView";
import { MessageItemView } from "../MessageItemView";
import { PlanItemView } from "../PlanItemView";
import { lineDiffStats } from "./utils/lineDiffStats";

/** The sheet scroller never grows past this fraction of the window. */
const SHEET_MAX_HEIGHT_FRACTION = 0.7;

function toolOutputText(call: TimelineToolCall): string {
	if (call.output === null) return "";
	if (typeof call.output === "string") return call.output;
	return JSON.stringify(call.output, null, 2);
}

/**
 * Timeline row title. For command-running tools the adapter's title IS the
 * raw command line — surface the model-written `description` from the input
 * instead; the command itself stays in the detail sheet.
 */
function toolRowTitle(call: TimelineToolCall): string {
	const input = call.input;
	if (input !== null && typeof input === "object" && !Array.isArray(input)) {
		const { command, description } = input as Record<string, unknown>;
		if (
			typeof command === "string" &&
			typeof description === "string" &&
			description.length > 0
		) {
			return description;
		}
	}
	return call.title || call.tool.name || "tool";
}

/** Nested tool calls run so far — the subagent row's subtitle. */
function countToolCalls(items: TimelineItem[]): number {
	let count = 0;
	for (const item of items) {
		if (item.kind === "tool_call") {
			count += 1 + countToolCalls(item.children);
		}
	}
	return count;
}

/**
 * Mirrors TimelineItemView's switch for items nested inside a Task tool call
 * (subagent runs). Kept local so the recursion stays ToolCallItemView →
 * ToolCallItemView without an import cycle through TimelineItemView.
 */
function ChildItemView({
	item,
	onRespond,
}: {
	item: TimelineItem;
	onRespond: RespondToPermission;
}) {
	switch (item.kind) {
		case "message":
			return <MessageItemView item={item} />;
		case "tool_call":
			return <ToolCallItemView item={item} onRespond={onRespond} />;
		case "plan":
			return <PlanItemView item={item} />;
	}
}

/**
 * A tool call is a single stable timeline row — wrench, title, `>` chevron —
 * that never grows in place (expanding cards inside the list shifts the
 * scroll). Tapping it opens the detail (parameters, permission record, nested
 * subagent items, output) in a native SwiftUI bottom sheet, same template as
 * the PermissionCard's detail sheet. Live permission asks surface in the
 * PermissionStack above the composer; the copy here is the for-the-record
 * resolution, visible only when the sheet is opened.
 */
export function ToolCallItemView({
	item,
	onRespond,
}: {
	item: TimelineToolCallItem;
	onRespond: RespondToPermission;
}) {
	const theme = useTheme();
	const { width, height } = useWindowDimensions();
	const [isPresented, setIsPresented] = useState(false);
	// The Host mounts a native hosting controller per sheet — with dozens of
	// tool rows per thread that's real weight, so mount lazily on first open.
	const [sheetMounted, setSheetMounted] = useState(false);

	const state = item.call.state;
	const isRunning =
		state !== "succeeded" && state !== "failed" && state !== "cancelled";
	const failed = state === "failed";
	const title = toolRowTitle(item.call);
	// The sheet keeps the adapter's full title (for Bash, the command line).
	const sheetTitle = item.call.title || item.call.tool.name || "tool";
	const output = toolOutputText(item.call);

	// GitHub-style change stats for file-editing tools, from the tool input
	// (the input streams in via updates, so this appears once it's complete).
	const diff = lineDiffStats(item.call.tool.name, item.call.input);
	const showDiff = diff !== null && diff.additions + diff.deletions > 0;

	const nestedToolCount = countToolCalls(item.children);
	const subtitle =
		nestedToolCount > 0
			? `${nestedToolCount} tool${nestedToolCount === 1 ? "" : "s"}`
			: null;

	// Running indicator: the title breathes while the tool executes — no badge
	// chrome, the fade loop itself is the signal.
	// Auto-reversed with a sine ease so the fade is equally smooth in both
	// directions — no snap at the loop seam.
	const pulse = useDerivedValue(
		() =>
			isRunning
				? withRepeat(
						withTiming(0.35, {
							duration: 800,
							easing: Easing.inOut(Easing.sin),
						}),
						-1,
						true,
					)
				: withTiming(1, { duration: 200 }),
		[isRunning],
	);
	const titleStyle = useAnimatedStyle(
		() => ({ opacity: pulse.value }),
		[pulse],
	);

	const openSheet = () => {
		setSheetMounted(true);
		setIsPresented(true);
	};

	return (
		<View className="w-full gap-2">
			<Pressable
				accessibilityLabel={`Show ${title} details`}
				className="w-full flex-row items-center gap-2 px-0.5 py-1"
				onPress={openSheet}
			>
				<Icon as={WrenchIcon} className="size-4 text-muted-foreground" />
				<View className="flex-1 gap-0.5">
					<View className="flex-row items-center gap-2">
						<Animated.View className="shrink" style={titleStyle}>
							<Text className="font-medium text-sm" numberOfLines={1}>
								{title}
							</Text>
						</Animated.View>
						{showDiff ? (
							<View className="flex-row items-center gap-1">
								{diff.additions > 0 ? (
									<Text className="font-mono text-green-500 text-xs">
										+{diff.additions}
									</Text>
								) : null}
								{diff.deletions > 0 ? (
									<Text className="font-mono text-red-500 text-xs">
										−{diff.deletions}
									</Text>
								) : null}
							</View>
						) : null}
						{/* No status chrome — only a failure leaves a subtle faded mark. */}
						{failed ? (
							<Icon as={XIcon} className="size-3.5 text-destructive/70" />
						) : null}
					</View>
					{subtitle ? (
						<Text className="text-muted-foreground text-xs">{subtitle}</Text>
					) : null}
				</View>
				<Icon as={ChevronRightIcon} className="size-4 text-muted-foreground" />
			</Pressable>

			{sheetMounted ? (
				<Host style={{ position: "absolute", width }}>
					<BottomSheet
						fitToContents
						isPresented={isPresented}
						onIsPresentedChange={setIsPresented}
					>
						<Group
							modifiers={[
								environment("colorScheme", "dark"),
								presentationDragIndicator("visible"),
								background(theme.background),
							]}
						>
							<RNHostView matchContents>
								<View className="px-5 pt-6 pb-8">
									<ScrollView
										style={{ maxHeight: height * SHEET_MAX_HEIGHT_FRACTION }}
									>
										<View className="gap-4">
											<Text
												className="font-semibold text-base"
												style={{ color: theme.foreground }}
											>
												{sheetTitle}
											</Text>
											{item.call.input === null ? null : (
												<ToolInput input={item.call.input} />
											)}
											{item.permissions.map((view) => (
												<PermissionRequestView
													key={view.permissionId}
													view={view}
													onRespond={onRespond}
												/>
											))}
											{item.children.length > 0 && (
												<View className="gap-2 border-border border-l pl-3">
													{item.children.map((child) => (
														<ChildItemView
															key={child.id}
															item={child}
															onRespond={onRespond}
														/>
													))}
												</View>
											)}
											<ToolOutput
												output={failed ? undefined : output || undefined}
												errorText={failed ? output || "Tool failed" : undefined}
											/>
										</View>
									</ScrollView>
								</View>
							</RNHostView>
						</Group>
					</BottomSheet>
				</Host>
			) : null}
		</View>
	);
}
