import { View, type ViewProps } from "react-native";
import { StatusDot } from "@/components/StatusDot";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type AssistantMessageHeadVariant =
	| "idle"
	| "streaming"
	| "thinking"
	| "paused"
	| "completed";

type VariantConfig = {
	dotVariant?: "live" | "warning" | "success" | "neutral";
	statusText?: string;
	dotOpacity?: number;
};

const VARIANT: Record<AssistantMessageHeadVariant, VariantConfig> = {
	idle: {},
	streaming: { dotVariant: "live", statusText: "STREAMING" },
	thinking: { dotVariant: "warning", statusText: "THINKING" },
	paused: { dotVariant: "warning", statusText: "PAUSED" },
	completed: { dotVariant: "success", statusText: "COMPLETED" },
};

export type AssistantMessageHeadProps = ViewProps & {
	/** Initial(s) shown in the avatar fallback. Default "A". */
	initials?: string;
	/** Label text. Defaults to "ASSISTANT". */
	label?: string;
	timestamp: string;
	variant?: AssistantMessageHeadVariant;
	/** Extra trailing text for completed (e.g. "· 3.2s"). */
	completedDuration?: string;
};

/**
 * Header row for an assistant message (UC-RENDER-01).
 *
 * Per mol-assistant-message-head spec:
 *  - Avatar (sm accent) + ASSISTANT label + · + timestamp + optional status segment
 *  - 5 variants drive the status segment visibility + content
 *  - Non-interactive — body organism handles long-press
 *
 * Composes vendor Avatar + first-party StatusDot + Text.
 */
export function AssistantMessageHead({
	initials = "A",
	label = "ASSISTANT",
	timestamp,
	variant = "idle",
	completedDuration,
	className,
	...props
}: AssistantMessageHeadProps) {
	const cfg = VARIANT[variant];
	const showStatus = variant !== "idle" && cfg.statusText;

	return (
		<View
			accessibilityRole="header"
			className={cn("flex-row items-center gap-2", className)}
			{...props}
		>
			<Avatar alt={`${label} avatar`} className="size-6 bg-primary">
				<AvatarFallback className="bg-primary">
					<Text className="text-xs font-bold text-primary-foreground">
						{initials}
					</Text>
				</AvatarFallback>
			</Avatar>

			<Text className="font-mono text-xs uppercase tracking-wider font-semibold text-foreground">
				{label}
			</Text>
			<Text className="font-mono text-xs text-muted-foreground/60">·</Text>
			<Text className="font-mono text-xs text-muted-foreground">
				{timestamp}
			</Text>

			{showStatus ? (
				<View
					accessibilityRole="alert"
					accessibilityLiveRegion="polite"
					className={cn(
						"flex-row items-center gap-2",
						variant === "completed" && "opacity-50",
					)}
				>
					<Text className="font-mono text-xs text-muted-foreground/60">·</Text>
					{cfg.dotVariant ? (
						<StatusDot variant={cfg.dotVariant} size="xs" />
					) : null}
					<Text className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
						{cfg.statusText}
						{variant === "completed" && completedDuration
							? ` · ${completedDuration}`
							: ""}
					</Text>
				</View>
			) : null}
		</View>
	);
}
