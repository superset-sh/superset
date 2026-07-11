import {
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
 * is viewed here first.
 */
export function PermissionRequestView({
	view,
	onRespond,
}: {
	view: PermissionView;
	onRespond: RespondToPermission;
}) {
	// Optimistic highlight: color the tapped option immediately while the
	// response round-trips; the journal's resolution takes over once it lands.
	const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
	const resolved = view.resolution !== null;
	// Multi-select resolutions carry several picked ids (selectedOptionIds
	// unpacks the outcome's _meta); a cancelled outcome highlights none.
	const selectedIds = view.resolution
		? new Set(selectedOptionIds(view.resolution))
		: new Set(pendingOptionId === null ? [] : [pendingOptionId]);
	const answered = resolved || pendingOptionId !== null;

	return (
		<View className="w-full rounded-lg border border-border bg-card px-4 py-3">
			<Text className="text-muted-foreground text-xs">
				The agent asked for permission
			</Text>
			{view.options.map((option) => (
				<Pressable
					key={option.optionId}
					accessibilityRole="button"
					disabled={answered}
					className="py-2"
					onPress={() => {
						setPendingOptionId(option.optionId);
						onRespond(view.requestId, {
							outcome: "selected",
							optionId: option.optionId,
						}).catch(() => setPendingOptionId(null));
					}}
				>
					<Text
						className={cn(
							"text-sm",
							answered && !selectedIds.has(option.optionId)
								? "text-muted-foreground/50"
								: "text-foreground",
						)}
					>
						{option.name}
					</Text>
				</Pressable>
			))}
		</View>
	);
}
