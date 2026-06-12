import { BookmarkIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text, TextClassContext } from "@/components/ui/text";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CheckpointProps = React.ComponentProps<typeof View>;

export const Checkpoint = ({
	className,
	children,
	...props
}: CheckpointProps) => (
	<TextClassContext.Provider value="text-muted-foreground">
		<View
			className={cn("flex-row items-center gap-0.5 overflow-hidden", className)}
			{...props}
		>
			{children}
			<Separator className="w-auto flex-1" />
		</View>
	</TextClassContext.Provider>
);

export type CheckpointIconProps = Omit<React.ComponentProps<typeof Icon>, "as">;

export const CheckpointIcon = ({
	className,
	children,
	...props
}: CheckpointIconProps) =>
	children ?? (
		<Icon
			as={BookmarkIcon}
			className={cn("size-4 shrink-0 text-muted-foreground", className)}
			{...props}
		/>
	);

export type CheckpointTriggerProps = ButtonProps & {
	tooltip?: string;
};

export const CheckpointTrigger = ({
	children,
	variant = "ghost",
	size = "sm",
	tooltip,
	...props
}: CheckpointTriggerProps) => {
	const button = (
		<Button size={size} variant={variant} {...props}>
			{children}
		</Button>
	);

	if (tooltip) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent align="start" side="bottom">
					<Text>{tooltip}</Text>
				</TooltipContent>
			</Tooltip>
		);
	}

	return button;
};
