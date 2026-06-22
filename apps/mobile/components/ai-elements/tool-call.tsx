import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

export type ToolCallProps = {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
	isPending: boolean;
	isError: boolean;
	onClick?: () => void;
	className?: string;
};

export const ToolCall = ({
	icon: _icon,
	title,
	subtitle,
	isPending,
	isError: _isError,
	onClick,
	className,
}: ToolCallProps) => (
	<View
		className={cn("flex-row items-center gap-1.5 rounded-md py-0.5", className)}
	>
		{isPending ? (
			<Shimmer className="font-medium text-muted-foreground text-xs">
				{title}
			</Shimmer>
		) : (
			<Text className="shrink-0 font-medium text-muted-foreground text-xs">
				{title}
			</Text>
		)}
		{subtitle ? (
			<Text
				accessibilityRole={onClick ? "button" : undefined}
				className="min-w-0 shrink text-muted-foreground/60 text-xs"
				numberOfLines={1}
				onPress={onClick}
				suppressHighlighting
			>
				{subtitle}
			</Text>
		) : null}
	</View>
);
