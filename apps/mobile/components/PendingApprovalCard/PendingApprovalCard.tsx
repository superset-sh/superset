import { Check, type LucideIcon, Target, X } from "lucide-react-native";
import { View, type ViewProps } from "react-native";
import { ToolStatusRule } from "@/components/ToolStatusRule";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type PendingApprovalCardState =
	| "pending"
	| "resolving"
	| "approved"
	| "declined";

type StateConfig = {
	ruleVariant: "pending" | "done" | "error";
	icon: LucideIcon;
	iconColorClass: string;
	titleOverride?: string;
};

const STATE: Record<PendingApprovalCardState, StateConfig> = {
	pending: {
		ruleVariant: "pending",
		icon: Target,
		iconColorClass: "text-state-warning-fg",
	},
	resolving: {
		ruleVariant: "pending",
		icon: Target,
		iconColorClass: "text-state-warning-fg",
	},
	approved: {
		ruleVariant: "done",
		icon: Check,
		iconColorClass: "text-state-success-fg",
		titleOverride: "Tool approved",
	},
	declined: {
		ruleVariant: "error",
		icon: X,
		iconColorClass: "text-state-danger-fg",
		titleOverride: "Tool declined",
	},
};

export type PendingApprovalCardProps = ViewProps & {
	title: string;
	subtitle?: string;
	argsPreview?: string;
	state?: PendingApprovalCardState;
	/** Show ALLOWABLE badge in header (tool supports always-allow). */
	alwaysAllowable?: boolean;
	/** Internal scroll on the args preview when multi-line (≤120pt tall). */
	detailed?: boolean;
};

/**
 * Inline pending-approval card in the message stream (UC-PAUSE-01 §A).
 * Pairs with ApprovalFooter molecule below.
 *
 * Per mol-pending-approval-card spec:
 *  - vertical ToolStatusRule (amber pending → green done → red error)
 *  - icon (⌖ target / ✓ check / ✕) matches state palette
 *  - optional ALLOWABLE badge in header (always-allow tools)
 *  - resolving = pending appearance at 50% opacity (optimistic tap)
 *  - args preview shown below hairline divider
 *
 * Composes ToolStatusRule + Icon + Text + vendor Badge + Separator.
 */
export function PendingApprovalCard({
	title,
	subtitle,
	argsPreview,
	state = "pending",
	alwaysAllowable,
	detailed,
	className,
	...props
}: PendingApprovalCardProps) {
	const cfg = STATE[state];
	const displayTitle = cfg.titleOverride ?? title;
	const isResolving = state === "resolving";

	return (
		<View
			accessibilityRole="alert"
			className={cn(
				"flex-row items-stretch overflow-hidden rounded-lg border border-border bg-card",
				isResolving && "opacity-50",
				className,
			)}
			{...props}
		>
			<ToolStatusRule variant={cfg.ruleVariant} orientation="vertical" />
			<View className="flex-1 px-3 py-2.5 gap-2">
				<View className="flex-row items-center gap-2">
					<Icon as={cfg.icon} className={cn("size-4", cfg.iconColorClass)} />
					<Text className="flex-1 font-medium text-foreground">
						{displayTitle}
					</Text>
					{alwaysAllowable && state === "pending" ? (
						<Badge variant="secondary" className="px-1.5 py-0">
							<Text className="text-[10px] font-mono uppercase tracking-wider text-state-warning-fg">
								ALLOWABLE
							</Text>
						</Badge>
					) : null}
				</View>
				{subtitle ? (
					<Text variant="muted" className="font-mono text-xs">
						{subtitle}
					</Text>
				) : null}
				{argsPreview ? (
					<>
						<Separator />
						<Text
							className={cn(
								"font-mono text-xs text-foreground",
								detailed && "max-h-32",
							)}
							numberOfLines={detailed ? undefined : 3}
						>
							{argsPreview}
						</Text>
					</>
				) : null}
			</View>
		</View>
	);
}
