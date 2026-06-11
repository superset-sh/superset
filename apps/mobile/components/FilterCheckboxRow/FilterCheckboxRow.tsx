import {
	Activity,
	Cloud,
	Crosshair,
	GitBranch,
	Laptop,
	type LucideIcon,
} from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import type { SessionHostKind } from "@/components/SessionRow";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type FilterCheckboxRowKind = "workspace" | "status";
export type FilterStatusValue = "streaming" | "pause-pending" | "idle";

const HOST_ICON: Record<SessionHostKind, LucideIcon> = {
	laptop: Laptop,
	cloud: Cloud,
};

const STATUS_ICON: Record<FilterStatusValue, LucideIcon> = {
	streaming: Crosshair,
	"pause-pending": Activity,
	idle: Activity,
};

const STATUS_ICON_COLOR: Record<FilterStatusValue, string> = {
	streaming: "text-state-live-fg",
	"pause-pending": "text-state-warning-fg",
	idle: "text-muted-foreground",
};

type WorkspaceProps = {
	kind: "workspace";
	branch: string;
	hostName: string;
	hostKind?: SessionHostKind;
	label?: never;
	statusValue?: never;
};

type StatusProps = {
	kind: "status";
	statusValue: FilterStatusValue;
	label: string;
	branch?: never;
	hostName?: never;
	hostKind?: never;
};

export type FilterCheckboxRowProps = Omit<
	PressableProps,
	"children" | "onPress"
> & {
	checked: boolean;
	onCheckedChange: (next: boolean) => void;
} & (WorkspaceProps | StatusProps);

/**
 * Single row in the SessionFilterSheet (UC-NAV-08 §C). Composes vendor
 * Checkbox + lucide icons + label.
 *
 * Variants:
 *  - workspace: git-branch icon + branch name · host icon + host name
 *  - status: status icon (colored per state) + label
 *
 * The whole row is tappable (a11y `accessibilityState.selected` is set), so
 * users can tap anywhere in the row to toggle the checkbox.
 */
export function FilterCheckboxRow(props: FilterCheckboxRowProps) {
	const { checked, onCheckedChange, className, disabled, ...rest } = props;
	const handleToggle = () => onCheckedChange(!checked);

	return (
		<Pressable
			accessibilityRole="checkbox"
			accessibilityState={{ checked, disabled: disabled ?? undefined }}
			onPress={handleToggle}
			disabled={disabled}
			className={cn(
				"flex-row items-center gap-3 px-4 min-h-touch-min py-2 active:bg-accent",
				disabled && "opacity-50",
				className,
			)}
			{...rest}
		>
			<Checkbox
				checked={checked}
				onCheckedChange={(next) => onCheckedChange(Boolean(next))}
				disabled={disabled ?? false}
			/>
			{props.kind === "workspace" ? (
				<View className="flex-1 flex-row items-center gap-1">
					<Icon as={GitBranch} className="text-muted-foreground size-3.5" />
					<Text className="text-foreground font-mono">{props.branch}</Text>
					<Text variant="muted" className="text-xs">
						·
					</Text>
					<Icon
						as={HOST_ICON[props.hostKind ?? "laptop"]}
						className="text-muted-foreground size-3.5"
					/>
					<Text variant="muted" className="font-mono">
						{props.hostName}
					</Text>
				</View>
			) : (
				<View className="flex-1 flex-row items-center gap-2">
					<Icon
						as={STATUS_ICON[props.statusValue]}
						className={cn("size-4", STATUS_ICON_COLOR[props.statusValue])}
					/>
					<Text className="text-foreground">{props.label}</Text>
				</View>
			)}
		</Pressable>
	);
}
