import {
	ChevronRight,
	Cloud,
	GitBranch,
	Laptop,
	type LucideIcon,
} from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { StatusDot } from "@/components/StatusDot";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type StatusDotVariant = "live" | "warning" | "danger" | "success" | "neutral";

export type SessionStatus = "live" | "warning" | "danger" | "idle" | "archived";
export type SessionHostKind = "laptop" | "cloud";

const STATUS_TO_DOT: Record<SessionStatus, StatusDotVariant> = {
	live: "live",
	warning: "warning",
	danger: "danger",
	idle: "neutral",
	archived: "neutral",
};

const HOST_ICON: Record<SessionHostKind, LucideIcon> = {
	laptop: Laptop,
	cloud: Cloud,
};

const STATUS_LABEL_COLOR: Record<SessionStatus, string> = {
	live: "text-state-live-fg",
	warning: "text-state-warning-fg",
	danger: "text-state-danger-fg",
	idle: "text-muted-foreground",
	archived: "text-muted-foreground",
};

export type SessionRowProps = Omit<PressableProps, "children"> & {
	title: string;
	branch: string;
	hostName: string;
	hostKind?: SessionHostKind;
	/** Human time like "2m ago", "1h ago", "yesterday". */
	timeLabel?: string;
	/** Optional trailing status label (e.g. "streaming", "pause pending"). When set, replaces the time slot or appends per design. */
	statusLabel?: string;
	status?: SessionStatus;
	/** Show an accent dot in the trailing slot to indicate unread updates. */
	unread?: boolean;
	onLongPress?: PressableProps["onLongPress"];
};

/**
 * Sessions-list row (UC-NAV §A). Composes:
 *  - StatusDot (leading)
 *  - Title text (truncating)
 *  - Meta line: git-branch icon · branch · host icon · host · time (or status label)
 *  - Trailing chevron + optional unread Badge dot
 *
 * Per mol-session-row spec — 5 status variants drive dot + status-label color.
 * The whole row is a Pressable; long-press exposes the copy-title affordance
 * (caller wires `onLongPress`).
 */
export function SessionRow({
	title,
	branch,
	hostName,
	hostKind = "laptop",
	timeLabel,
	statusLabel,
	status = "idle",
	unread = false,
	onLongPress,
	onPress,
	disabled,
	className,
	...props
}: SessionRowProps) {
	const HostIcon = HOST_ICON[hostKind];
	const isArchived = status === "archived";

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Open session: ${title}`}
			accessibilityHint="Long-press for actions"
			onPress={onPress}
			onLongPress={onLongPress}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-3 px-4 min-h-touch-min py-3 active:bg-accent",
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			{/* Leading status dot */}
			<View className="w-3 items-center">
				<StatusDot variant={STATUS_TO_DOT[status]} size="sm" />
			</View>

			{/* Body: title + meta line */}
			<View className="flex-1 gap-0.5">
				<Text
					className={cn(
						"text-foreground",
						isArchived && "text-muted-foreground",
					)}
					numberOfLines={1}
				>
					{title}
				</Text>
				<View className="flex-row items-center gap-1">
					<Icon as={GitBranch} className="text-muted-foreground size-3" />
					<Text variant="muted" className="text-xs font-mono" numberOfLines={1}>
						{branch}
					</Text>
					<Text variant="muted" className="text-xs">
						·
					</Text>
					<Icon as={HostIcon} className="text-muted-foreground size-3" />
					<Text variant="muted" className="text-xs font-mono" numberOfLines={1}>
						{hostName}
					</Text>
					{(timeLabel || statusLabel) && (
						<>
							<Text variant="muted" className="text-xs">
								·
							</Text>
							{statusLabel ? (
								<Text
									className={cn(
										"text-xs font-mono uppercase tracking-wider",
										STATUS_LABEL_COLOR[status],
									)}
									numberOfLines={1}
								>
									{statusLabel}
								</Text>
							) : (
								<Text variant="muted" className="text-xs">
									{timeLabel}
								</Text>
							)}
						</>
					)}
				</View>
			</View>

			{/* Trailing chevron + optional unread badge */}
			<View className="flex-row items-center gap-2">
				{unread ? (
					<Badge variant="default" className="size-2 rounded-full p-0">
						{null}
					</Badge>
				) : null}
				<Icon as={ChevronRight} className="text-muted-foreground size-4" />
			</View>
		</Pressable>
	);
}
