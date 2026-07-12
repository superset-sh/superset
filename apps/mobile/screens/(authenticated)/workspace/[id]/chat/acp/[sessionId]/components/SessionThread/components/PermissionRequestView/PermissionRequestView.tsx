import {
	makeSelectedOutcome,
	type PermissionOption,
	type PermissionView,
	selectedOptionIds,
} from "@superset/session-protocol";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { RespondToPermission } from "../TimelineItemView";

/**
 * The for-the-record copy of a permission request, rendered inside its tool
 * call's detail sheet: every option stays visible with the picked one
 * highlighted (the rest fade to muted), so the resolution reads at a glance.
 * Live asks are answered from the PermissionStack above the composer instead —
 * this card only still accepts taps for the edge case where a pending request
 * is viewed here first. Multi-select questions collect picks until Done, same
 * as PermissionCard; reject options (Skip) always answer immediately.
 */
export function PermissionRequestView({
	view,
	onRespond,
}: {
	view: PermissionView;
	onRespond: RespondToPermission;
}) {
	// Optimistic highlight: color the answered option(s) immediately while the
	// response round-trips; the journal's resolution takes over once it lands.
	const [pendingIds, setPendingIds] = useState<ReadonlySet<string> | null>(
		null,
	);
	// Multi-select picks collected until Done (mirrors PermissionCard).
	const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
	const resolved = view.resolution !== null;
	const answered = resolved || pendingIds !== null;
	const multiSelect = view.multiSelect === true;

	// Multi-select resolutions carry several picked ids (selectedOptionIds
	// unpacks the outcome's _meta); a cancelled outcome highlights none.
	const selectedIds = view.resolution
		? new Set(selectedOptionIds(view.resolution))
		: (pendingIds ?? picked);

	const isReject = (option: PermissionOption) =>
		option.kind === "reject_once" || option.kind === "reject_always";

	const respond = (requestIds: ReadonlySet<string>) => {
		setPendingIds(requestIds);
		onRespond(view.requestId, makeSelectedOutcome([...requestIds])).catch(
			(cause) => {
				console.warn(
					`[acp] permission response failed (${view.requestId})`,
					cause,
				);
				setPendingIds(null);
			},
		);
	};

	const handleOption = (option: PermissionOption) => {
		if (multiSelect && !isReject(option)) {
			setPicked((prev) => {
				const next = new Set(prev);
				if (next.has(option.optionId)) {
					next.delete(option.optionId);
				} else {
					next.add(option.optionId);
				}
				return next;
			});
			return;
		}
		respond(new Set([option.optionId]));
	};

	return (
		<View className="w-full rounded-lg border border-border bg-card px-4 py-3">
			<Text className="text-muted-foreground text-xs">
				The agent asked for permission
			</Text>
			{view.options.map((option) => (
				<Pressable
					key={option.optionId}
					accessibilityRole="button"
					accessibilityState={{ selected: selectedIds.has(option.optionId) }}
					disabled={answered}
					className="py-2"
					onPress={() => handleOption(option)}
				>
					<Text
						className={cn(
							"text-sm",
							answered && !selectedIds.has(option.optionId)
								? "text-muted-foreground/50"
								: selectedIds.has(option.optionId)
									? "text-primary font-medium"
									: "text-foreground",
						)}
					>
						{option.name}
					</Text>
				</Pressable>
			))}
			{multiSelect && !answered ? (
				<Pressable
					accessibilityRole="button"
					disabled={picked.size === 0}
					className="border-border border-t py-2"
					onPress={() => respond(picked)}
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
	);
}
