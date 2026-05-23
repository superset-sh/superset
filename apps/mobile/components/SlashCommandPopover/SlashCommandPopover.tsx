import type { LucideIcon } from "lucide-react-native";
import { View, type ViewProps } from "react-native";
import {
	SlashCommandOption,
	type SlashCommandSourceKind,
} from "@/components/SlashCommandOption";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type SlashCommand = {
	id: string;
	name: string;
	description: string;
	source: SlashCommandSourceKind;
	icon?: LucideIcon;
};

export type SlashCommandPopoverProps = ViewProps & {
	open: boolean;
	commands: ReadonlyArray<SlashCommand>;
	/** Currently highlighted (arrow-key focus) index. */
	highlightedIndex?: number;
	onSelect?: (command: SlashCommand) => void;
	/** Optional empty-state message when commands is empty. */
	emptyLabel?: string;
};

/**
 * Floating list above the composer when the input begins with "/". Renders
 * SlashCommandOption rows in groups: built-ins, then a divider, then project +
 * user-scoped commands. UC-COMP-01 §C.
 *
 * Positioning + show/hide is the caller's job — this organism just renders the
 * list when `open` is true.
 */
export function SlashCommandPopover({
	open,
	commands,
	highlightedIndex,
	onSelect,
	emptyLabel = "No commands match",
	className,
	...props
}: SlashCommandPopoverProps) {
	if (!open) return null;

	const builtins = commands.filter((c) => c.source === "builtin");
	const custom = commands.filter((c) => c.source !== "builtin");

	return (
		<View
			accessibilityRole="menu"
			className={cn(
				"bg-popover border border-border rounded-2xl shadow-lg overflow-hidden",
				className,
			)}
			{...props}
		>
			{commands.length === 0 ? (
				<View className="px-4 py-3">
					<Text variant="muted">{emptyLabel}</Text>
				</View>
			) : (
				<>
					{builtins.map((cmd, idx) => (
						<SlashCommandOption
							key={cmd.id}
							name={cmd.name}
							description={cmd.description}
							source={cmd.source}
							icon={cmd.icon}
							isHighlighted={highlightedIndex === idx}
							onPress={() => onSelect?.(cmd)}
						/>
					))}
					{builtins.length > 0 && custom.length > 0 ? (
						<Separator className="my-1" />
					) : null}
					{custom.map((cmd, idx) => (
						<SlashCommandOption
							key={cmd.id}
							name={cmd.name}
							description={cmd.description}
							source={cmd.source}
							icon={cmd.icon}
							isHighlighted={highlightedIndex === builtins.length + idx}
							onPress={() => onSelect?.(cmd)}
						/>
					))}
				</>
			)}
		</View>
	);
}
