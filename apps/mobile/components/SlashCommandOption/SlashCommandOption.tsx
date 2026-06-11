import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, type PressableProps, View } from "react-native";
import { ProgressDots } from "@/components/ProgressDots";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const slashCommandOptionVariants = cva(
	"flex-row items-start min-h-touch-min gap-3 px-4 py-3 active:opacity-70",
	{
		variants: {
			isHighlighted: {
				true: "bg-accent",
				false: "",
			},
			isLoading: {
				true: "opacity-70",
				false: "",
			},
		},
		defaultVariants: { isHighlighted: false, isLoading: false },
	},
);

const sourceBadgeVariantByKind = {
	builtin: "secondary",
	project: "default",
	user: "destructive",
} as const;

const sourceBadgeLabelByKind = {
	builtin: "BUILT-IN",
	project: "PROJECT",
	user: "USER",
} as const;

export type SlashCommandSourceKind = keyof typeof sourceBadgeVariantByKind;

export type SlashCommandOptionProps = PressableProps &
	VariantProps<typeof slashCommandOptionVariants> & {
		/** Slash-prefixed command name (e.g. "/model", "/clear"). */
		name: string;
		/** Short description shown below the name. */
		description: string;
		/** Source kind — drives the trailing badge. */
		source?: SlashCommandSourceKind;
		/** Optional leading lucide icon. */
		icon?: LucideIcon;
	};

/**
 * Single row inside the slash-command popover. Slash-prefixed command name
 * (accent monospace) + plain-text description + optional source badge.
 *
 * Per mol-slash-command-option spec:
 *  - sources: builtin (neutral badge "BUILT-IN") · project (accent "PROJECT")
 *    · user (live "USER")
 *  - 44pt minimum height for iOS HIG
 *  - `isHighlighted` for keyboard/arrow-key focus state
 *  - `isLoading` swaps in ProgressDots trailing
 *
 * Composes vendor Badge + first-party ProgressDots + vendor Icon + Text.
 */
export function SlashCommandOption({
	name,
	description,
	source = "builtin",
	icon,
	isHighlighted,
	isLoading,
	className,
	disabled,
	...props
}: SlashCommandOptionProps) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${name} — ${description}`}
			accessibilityState={{
				selected: isHighlighted ?? false,
				disabled: disabled ?? false,
				busy: isLoading ?? false,
			}}
			disabled={disabled || isLoading}
			className={cn(
				slashCommandOptionVariants({ isHighlighted, isLoading }),
				disabled && "opacity-40",
				className,
			)}
			{...props}
		>
			{icon ? (
				<Icon as={icon} className="size-4 text-muted-foreground mt-0.5" />
			) : null}
			<View className="flex-1 gap-0.5">
				<View className="flex-row items-center gap-2">
					<Text className="font-mono font-medium text-primary">{name}</Text>
					<Badge
						variant={sourceBadgeVariantByKind[source]}
						className="px-1.5 py-0"
					>
						<Text className="text-[10px] font-mono uppercase tracking-wider">
							{sourceBadgeLabelByKind[source]}
						</Text>
					</Badge>
				</View>
				<Text className="text-sm text-muted-foreground">{description}</Text>
			</View>
			{isLoading ? (
				<View className="self-center">
					<ProgressDots size="sm" variant="muted" />
				</View>
			) : null}
		</Pressable>
	);
}
