import { ChevronRight, Cog, type LucideIcon } from "lucide-react-native";
import {
	ActivityIndicator,
	Pressable,
	type PressableProps,
	View,
} from "react-native";
import { Pill } from "@/components/Pill";
import { ToolStatusRule } from "@/components/ToolStatusRule";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ToolCallStatus =
	| "running"
	| "done"
	| "pending"
	| "error"
	| "neutral";

type StatusConfig = {
	ruleVariant: "running" | "done" | "pending" | "error" | "neutral";
	statusPillVariant: "live" | "default" | "warning" | "danger" | "default";
	statusLabel?: string;
	iconColorClass: string;
	showSpinner?: boolean;
};

const STATUS: Record<ToolCallStatus, StatusConfig> = {
	running: {
		ruleVariant: "running",
		statusPillVariant: "live",
		statusLabel: "RUNNING",
		iconColorClass: "text-state-live-fg",
		showSpinner: true,
	},
	done: {
		ruleVariant: "done",
		statusPillVariant: "default",
		statusLabel: "DONE",
		iconColorClass: "text-muted-foreground",
	},
	pending: {
		ruleVariant: "pending",
		statusPillVariant: "warning",
		statusLabel: "AWAITING",
		iconColorClass: "text-state-warning-fg",
	},
	error: {
		ruleVariant: "error",
		statusPillVariant: "danger",
		statusLabel: "FAILED",
		iconColorClass: "text-state-danger-fg",
	},
	neutral: {
		ruleVariant: "neutral",
		statusPillVariant: "default",
		iconColorClass: "text-muted-foreground/60",
	},
};

export type ToolCallCardProps = PressableProps & {
	name: string;
	args?: string;
	status?: ToolCallStatus;
	icon?: LucideIcon;
	/** e.g. "0.3s" appended to DONE label. */
	duration?: string;
};

/**
 * Collapsed tool-call card (UC-RENDER-04). Tappable to navigate to detail view;
 * never expands in-place.
 *
 * Per mol-tool-call-card spec:
 *  - 5 status variants drive ToolStatusRule + status Pill + icon color
 *  - running shows inline ActivityIndicator instead of static spinner
 *  - tool name in monospace Pill (default variant)
 *  - args preview shown as truncated mono line below header
 *  - trailing chevron-right indicates tappability
 *
 * Composes ToolStatusRule + first-party Pill + Icon + Text + ActivityIndicator.
 */
export function ToolCallCard({
	name,
	args,
	status = "running",
	icon = Cog,
	duration,
	disabled,
	className,
	...props
}: ToolCallCardProps) {
	const cfg = STATUS[status];
	const statusText =
		status === "done" && duration
			? `${cfg.statusLabel} · ${duration}`
			: cfg.statusLabel;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${cfg.statusLabel ?? status} tool call: ${name}`}
			disabled={disabled}
			className={cn(
				"flex-row items-stretch overflow-hidden rounded-lg border border-border bg-card active:opacity-80",
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<ToolStatusRule variant={cfg.ruleVariant} orientation="vertical" />
			<View className="flex-1 px-3 py-2.5 gap-1.5">
				<View className="flex-row items-center gap-2">
					<Icon as={icon} className={cn("size-4", cfg.iconColorClass)} />
					<Pill label={name} variant="default" size="sm" monospace />
					<View className="flex-1" />
					{statusText ? (
						<View className="flex-row items-center gap-1">
							{cfg.showSpinner ? (
								<ActivityIndicator
									size="small"
									className="text-state-live-fg"
								/>
							) : null}
							<Pill
								label={statusText}
								variant={cfg.statusPillVariant}
								size="sm"
								uppercase
							/>
						</View>
					) : null}
				</View>
				{args ? (
					<View className="flex-row items-center gap-2">
						<Text
							className="flex-1 font-mono text-xs text-muted-foreground"
							numberOfLines={1}
						>
							{args}
						</Text>
						<Icon
							as={ChevronRight}
							className="size-3.5 text-muted-foreground/60"
						/>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}
