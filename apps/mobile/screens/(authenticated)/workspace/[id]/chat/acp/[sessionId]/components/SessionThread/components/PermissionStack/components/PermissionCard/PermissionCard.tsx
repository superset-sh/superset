import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import type {
	PendingPermission,
	PermissionOption,
} from "@superset/session-protocol";
import { CheckIcon, ChevronRightIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { ToolInput } from "@/components/ai-elements/tool";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/** The sheet scroller never grows past this fraction of the window. */
const SHEET_MAX_HEIGHT_FRACTION = 0.7;

/**
 * The front card of the PermissionStack: a size-constrained ask showing just
 * what the agent is trying to do (the tool call's human-readable title,
 * clamped) with the answer options below. The `>` chevron opens the full
 * request — untruncated title plus raw input — in a native bottom sheet, the
 * same template as the tool call rows.
 */
export function PermissionCard({
	pending,
	onAnswer,
}: {
	pending: PendingPermission;
	onAnswer: (requestId: string, optionIds: string[]) => void;
}) {
	const theme = useTheme();
	const { width, height } = useWindowDimensions();
	const [isPresented, setIsPresented] = useState(false);
	// Same lazy-mount as ToolCallItemView: the Host carries a native hosting
	// controller, so it only mounts once the detail is first opened.
	const [sheetMounted, setSheetMounted] = useState(false);
	// Multi-select cards collect picks here until Done; reject options (Skip)
	// still answer immediately — skipping and picking are mutually exclusive.
	const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
	const multiSelect = pending.multiSelect === true;

	const title = pending.toolCall.title || pending.toolCall.kind || "Permission";

	const isReject = (option: PermissionOption) =>
		option.kind === "reject_once" || option.kind === "reject_always";

	const handleOption = (option: PermissionOption) => {
		if (!multiSelect || isReject(option)) {
			onAnswer(pending.requestId, [option.optionId]);
			return;
		}
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(option.optionId)) {
				next.delete(option.optionId);
			} else {
				next.add(option.optionId);
			}
			return next;
		});
	};

	const openSheet = () => {
		setSheetMounted(true);
		setIsPresented(true);
	};

	return (
		// FadeInDown: the card arrives from the peek position above it; the
		// dismissed card just fades so it never slides over the composer.
		<Animated.View
			entering={FadeInDown.duration(200)}
			exiting={FadeOut.duration(150)}
			className="w-full rounded-2xl border border-border bg-card"
		>
			<Pressable
				accessibilityLabel={`Show full permission request: ${title}`}
				className="flex-row items-center gap-2 px-4 py-3"
				onPress={openSheet}
			>
				<Text className="flex-1 font-medium text-sm" numberOfLines={2}>
					{title}
				</Text>
				<Icon as={ChevronRightIcon} className="size-4 text-muted-foreground" />
			</Pressable>
			<View className="border-border border-t px-4 py-1">
				{pending.options.map((option) => (
					<Pressable
						key={option.optionId}
						accessibilityRole="button"
						className="flex-row items-center justify-between py-2"
						onPress={() => handleOption(option)}
					>
						<Text
							className={cn(
								"text-sm",
								isReject(option)
									? "text-destructive"
									: picked.has(option.optionId)
										? "text-primary font-medium"
										: "text-foreground",
							)}
						>
							{option.name}
						</Text>
						{picked.has(option.optionId) ? (
							<Icon as={CheckIcon} className="size-4 text-primary" />
						) : null}
					</Pressable>
				))}
				{multiSelect ? (
					<Pressable
						accessibilityRole="button"
						disabled={picked.size === 0}
						className="border-border border-t py-2"
						onPress={() => onAnswer(pending.requestId, [...picked])}
					>
						<Text
							className={cn(
								"text-sm font-medium",
								picked.size === 0 ? "text-muted-foreground/50" : "text-primary",
							)}
						>
							{picked.size === 0
								? "Select options above"
								: `Done (${picked.size} selected)`}
						</Text>
					</Pressable>
				) : null}
			</View>

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
												{title}
											</Text>
											{pending.toolCall.rawInput === undefined ? null : (
												<ToolInput input={pending.toolCall.rawInput} />
											)}
										</View>
									</ScrollView>
								</View>
							</RNHostView>
						</Group>
					</BottomSheet>
				</Host>
			) : null}
		</Animated.View>
	);
}
