import { ActivityIndicator, View, type ViewProps } from "react-native";
import { ToolStatusRule } from "@/components/ToolStatusRule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ApprovalFooterResolvingAction = "decline" | "approve" | "always";

export type ApprovalFooterProps = ViewProps & {
	queueCount?: number;
	queueIndex?: number;
	onDecline?: () => void;
	onApprove?: () => void;
	onAlways?: () => void;
	/** When set, dims the action row and shows a spinner on the indicated button. */
	resolving?: ApprovalFooterResolvingAction;
	/** Full-footer disabled (greyed out, no spinner). */
	disabled?: boolean;
};

/**
 * Sticky footer that docks above the composer during a tool-approval pause
 * (UC-PAUSE-01 §A). Pairs with PendingApprovalCard in the message stream above.
 *
 * Per mol-approval-footer spec:
 *  - Top horizontal amber ToolStatusRule connects visually to the pending card
 *  - Optional queue counter Badge ("1 OF 4") visible when queueCount > 1
 *  - Action order: Decline · Approve · Always (intentional one-handed UX deviation
 *    from the wireframe — center is thumb-reachable for the most-common positive
 *    action, destructive is outer)
 *  - `resolving` dims the row + shows a spinner on the indicated button
 *
 * Composes ToolStatusRule + vendor Badge + vendor Button + ActivityIndicator.
 */
export function ApprovalFooter({
	queueCount = 1,
	queueIndex = 1,
	onDecline,
	onApprove,
	onAlways,
	resolving,
	disabled,
	className,
	...props
}: ApprovalFooterProps) {
	const showCounter = queueCount > 1;
	const isResolving = resolving !== undefined;

	return (
		<View
			accessibilityRole="alert"
			accessibilityState={{ busy: isResolving, disabled: disabled ?? false }}
			className={cn("w-full bg-background border-t border-border", className)}
			{...props}
		>
			<ToolStatusRule variant="pending" orientation="horizontal" />
			<View className="px-4 pt-3 pb-4 flex-row items-center gap-3">
				{showCounter ? (
					<Badge variant="secondary" className="px-2 py-1">
						<Text className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
							{queueIndex} OF {queueCount}
						</Text>
					</Badge>
				) : null}
				<View
					className={cn(
						"flex-1 flex-row gap-2 items-center",
						(isResolving || disabled) && "opacity-50",
					)}
					pointerEvents={isResolving || disabled ? "none" : "auto"}
				>
					<Button
						variant="destructive"
						size="default"
						className="flex-1 h-touch-min"
						onPress={onDecline}
						accessibilityLabel="Decline tool action"
					>
						{resolving === "decline" ? (
							<ActivityIndicator size="small" className="text-white" />
						) : (
							<Text>Decline</Text>
						)}
					</Button>
					<Button
						variant="default"
						size="default"
						className="flex-1 h-touch-min"
						onPress={onApprove}
						accessibilityLabel="Approve tool action"
					>
						{resolving === "approve" ? (
							<ActivityIndicator
								size="small"
								className="text-primary-foreground"
							/>
						) : (
							<Text>Approve</Text>
						)}
					</Button>
					<Button
						variant="ghost"
						size="default"
						className="flex-1 h-touch-min"
						onPress={onAlways}
						accessibilityLabel="Always allow this tool category"
					>
						{resolving === "always" ? (
							<ActivityIndicator size="small" className="text-foreground" />
						) : (
							<Text>Always</Text>
						)}
					</Button>
				</View>
			</View>
		</View>
	);
}
