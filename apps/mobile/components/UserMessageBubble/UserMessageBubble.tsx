import { cva, type VariantProps } from "class-variance-authority";
import { Pressable, View, type ViewProps } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const bubbleVariants = cva(
	"max-w-[85%] self-end rounded-2xl px-4 py-2.5 active:opacity-80",
	{
		variants: {
			variant: {
				default: "bg-card",
				accent: "bg-primary/15",
				pending: "bg-card opacity-60",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export type UserMessageBubbleProps = ViewProps &
	VariantProps<typeof bubbleVariants> & {
		message: string;
		timestamp?: string;
		/** Show "Failed to send" + Retry button under the bubble. */
		failed?: boolean;
		onLongPress?: () => void;
		onRetry?: () => void;
	};

/**
 * User's outgoing message in chat (UC-RENDER-01). Right-aligned bubble with
 * styled surface; long-press triggers the copy/share context menu (host wires
 * onLongPress to a native ActionSheet).
 *
 * Per mol-user-message-bubble spec:
 *  - 3 variants: default · accent (ember @mentions) · pending (optimistic, 60% opacity)
 *  - failed=true → meta swap to "Failed to send" + inline Retry button
 *  - long-press affordance via `aria-haspopup="menu"` semantics
 *
 * Composes Pressable + vendor Button + Text.
 */
export function UserMessageBubble({
	message,
	timestamp,
	failed,
	variant,
	onLongPress,
	onRetry,
	className,
	...props
}: UserMessageBubbleProps) {
	return (
		<View
			accessibilityLabel={`Your message: ${message}`}
			className={cn("items-end gap-1", className)}
			{...props}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Long-press to copy or share"
				accessibilityHint="Opens the message context menu"
				onLongPress={onLongPress}
				delayLongPress={400}
				className={bubbleVariants({ variant })}
			>
				<Text className="text-foreground">{message}</Text>
			</Pressable>
			<View className="flex-row items-center gap-2 px-1">
				{failed ? (
					<>
						<Text className="text-xs text-state-danger-fg">Failed to send</Text>
						<Button
							size="sm"
							variant="link"
							className="h-auto px-1"
							onPress={onRetry}
						>
							<Text className="text-xs text-primary">Retry</Text>
						</Button>
					</>
				) : timestamp ? (
					<Text className="text-xs text-muted-foreground/70">{timestamp}</Text>
				) : null}
			</View>
		</View>
	);
}
