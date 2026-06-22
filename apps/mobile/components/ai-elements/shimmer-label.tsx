import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { TextShimmerProps } from "./shimmer";
import { Shimmer } from "./shimmer";

export type ShimmerLabelProps = Omit<
	TextShimmerProps,
	"children" | "className"
> & {
	children: string;
	className?: string;
	shimmerClassName?: string;
	isShimmering?: boolean;
};

export const ShimmerLabel = ({
	children,
	className,
	shimmerClassName,
	isShimmering = true,
	...props
}: ShimmerLabelProps) => (
	<View className={cn("shrink-0 self-start", className)}>
		{isShimmering ? (
			<Shimmer className={cn("font-medium", shimmerClassName)} {...props}>
				{children}
			</Shimmer>
		) : (
			<Text className="font-medium text-muted-foreground text-sm">
				{children}
			</Text>
		)}
	</View>
);
