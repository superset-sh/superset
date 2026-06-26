import { useCallback } from "react";
import { ScrollView } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type SuggestionsProps = React.ComponentProps<typeof ScrollView>;

export const Suggestions = ({
	className,
	children,
	...props
}: SuggestionsProps) => (
	<ScrollView
		className="w-full"
		contentContainerClassName={cn(
			"flex-row flex-nowrap items-center gap-2",
			className,
		)}
		horizontal
		showsHorizontalScrollIndicator={false}
		{...props}
	>
		{children}
	</ScrollView>
);

export type SuggestionProps = Omit<ButtonProps, "onPress"> & {
	suggestion: string;
	onPress?: (suggestion: string) => void;
};

export const Suggestion = ({
	suggestion,
	onPress,
	className,
	variant = "outline",
	size = "sm",
	children,
	...props
}: SuggestionProps) => {
	const handlePress = useCallback(() => {
		onPress?.(suggestion);
	}, [onPress, suggestion]);

	return (
		<Button
			className={cn("rounded-full px-4", className)}
			onPress={handlePress}
			size={size}
			variant={variant}
			{...props}
		>
			{typeof children === "string" ? (
				<Text>{children}</Text>
			) : (
				(children ?? <Text>{suggestion}</Text>)
			)}
		</Button>
	);
};
