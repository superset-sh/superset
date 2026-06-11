import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppHeader, type AppHeaderProps } from "@/components/AppHeader";
import { StatusDot } from "@/components/StatusDot";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ChatHeaderStatus = "live" | "streaming" | "paused" | "offline";

export type ChatHeaderProps = ViewProps & {
	title: string;
	subtitle?: string;
	/** Session status indicator surfaced as a leading-row dot + label above the title. */
	status?: ChatHeaderStatus;
	statusLabel?: string;
	onBack?: () => void;
	onActions?: () => void;
	/** Banner rendered between header and content (Banner molecule slot). */
	banner?: ReactNode;
	/** Apply elevated scroll shadow on the underlying AppHeader. */
	isScrolled?: boolean;
	showBack?: AppHeaderProps["showBack"];
	showActions?: AppHeaderProps["showActions"];
};

const STATUS_TO_DOT_VARIANT = {
	live: "live",
	streaming: "live",
	paused: "warning",
	offline: "danger",
} as const;

const DEFAULT_STATUS_LABEL: Record<ChatHeaderStatus, string> = {
	live: "Live",
	streaming: "Streaming…",
	paused: "Paused",
	offline: "Offline",
};

/**
 * Chat-view top region. Composes AppHeader with safe-area inset, an optional
 * session-status row (StatusDot + label) rendered above the header, and an
 * optional banner slot directly underneath. Every chat view (UC-RENDER-01..07,
 * UC-PAUSE-*, UC-PLATF-03) begins with this organism.
 */
export function ChatHeader({
	title,
	subtitle,
	status,
	statusLabel,
	onBack,
	onActions,
	banner,
	isScrolled = false,
	showBack,
	showActions,
	className,
	...props
}: ChatHeaderProps) {
	const insets = useSafeAreaInsets();

	return (
		<View
			className={cn("bg-background", className)}
			style={{ paddingTop: insets.top }}
			{...props}
		>
			{status ? (
				<View className="flex-row items-center gap-2 px-4 pt-1 pb-0.5">
					<StatusDot variant={STATUS_TO_DOT_VARIANT[status]} size="sm" />
					<Text
						variant="muted"
						className="text-xs font-mono uppercase tracking-wider"
					>
						{statusLabel ?? DEFAULT_STATUS_LABEL[status]}
					</Text>
				</View>
			) : null}
			<AppHeader
				title={title}
				subtitle={subtitle}
				onBack={onBack}
				onActions={onActions}
				isScrolled={isScrolled}
				showBack={showBack}
				showActions={showActions}
			/>
			{banner}
		</View>
	);
}
