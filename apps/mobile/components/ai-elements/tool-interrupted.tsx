import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ToolInterruptedProps = {
	toolName: string;
	subtitle?: string;
	className?: string;
};

export const ToolInterrupted = ({
	toolName,
	subtitle,
	className,
}: ToolInterruptedProps) => (
	<View
		className={cn("flex-row items-center gap-1.5 rounded-md py-0.5", className)}
	>
		<Text className="shrink-0 text-muted-foreground text-xs">
			{toolName} interrupted
		</Text>
		{subtitle ? (
			<Text
				className="min-w-0 shrink text-muted-foreground/60 text-xs"
				numberOfLines={1}
			>
				{subtitle}
			</Text>
		) : null}
	</View>
);
