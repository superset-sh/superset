import {
	ChevronRight,
	Cloud,
	GitBranch,
	Laptop,
	type LucideIcon,
} from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import type { SessionHostKind } from "@/components/SessionRow";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const HOST_ICON: Record<SessionHostKind, LucideIcon> = {
	laptop: Laptop,
	cloud: Cloud,
};

export type WorkspacePickerRowProps = Omit<PressableProps, "children"> & {
	branch: string;
	hostName: string;
	hostKind?: SessionHostKind;
	/** Subtitle line — e.g. "5 sessions · 2m ago" or "no sessions yet". */
	subtitle?: string;
	/** Trailing chevron — hidden when explicitly false. */
	showChevron?: boolean;
};

/**
 * Row in the NewChatSheet workspace picker (UC-NAV §D). Composes:
 *  - Leading git-branch IconGlyph
 *  - Body: branch · host icon + host (line 1) + subtitle (line 2)
 *  - Trailing chevron
 *
 * 44pt minimum row height. Tappable; long-press is not used here.
 */
export function WorkspacePickerRow({
	branch,
	hostName,
	hostKind = "laptop",
	subtitle,
	showChevron = true,
	onPress,
	disabled,
	className,
	...props
}: WorkspacePickerRowProps) {
	const HostIcon = HOST_ICON[hostKind];

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Start chat in workspace ${branch} on ${hostName}`}
			onPress={onPress}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-3 px-4 min-h-touch-min py-3 active:bg-accent",
				disabled && "opacity-50",
				className,
			)}
			{...props}
		>
			<Icon as={GitBranch} className="text-muted-foreground size-4" />
			<View className="flex-1 gap-0.5">
				<View className="flex-row items-center gap-1.5">
					<Text className="text-foreground font-mono" numberOfLines={1}>
						{branch}
					</Text>
					<Text variant="muted" className="text-xs">
						·
					</Text>
					<Icon as={HostIcon} className="text-muted-foreground size-3.5" />
					<Text variant="muted" className="text-xs font-mono">
						{hostName}
					</Text>
				</View>
				{subtitle ? (
					<Text variant="muted" className="text-xs">
						{subtitle}
					</Text>
				) : null}
			</View>
			{showChevron ? (
				<Icon as={ChevronRight} className="text-muted-foreground size-4" />
			) : null}
		</Pressable>
	);
}
