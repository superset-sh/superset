import type { LucideIcon } from "lucide-react-native";
import { XIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ArtifactProps = React.ComponentProps<typeof View>;

export const Artifact = ({ className, ...props }: ArtifactProps) => (
	<View
		className={cn(
			"flex-col overflow-hidden rounded-lg border border-border bg-background shadow-black/5 shadow-sm",
			className,
		)}
		{...props}
	/>
);

export type ArtifactHeaderProps = React.ComponentProps<typeof View>;

export const ArtifactHeader = ({
	className,
	...props
}: ArtifactHeaderProps) => (
	<View
		className={cn(
			"flex-row items-center justify-between border-border border-b bg-muted/50 px-4 py-3",
			className,
		)}
		{...props}
	/>
);

export type ArtifactCloseProps = ButtonProps & {
	label?: string;
};

export const ArtifactClose = ({
	className,
	children,
	label = "Close",
	size = "icon",
	variant = "ghost",
	...props
}: ArtifactCloseProps) => (
	<Button
		accessibilityLabel={label}
		className={cn("size-8", className)}
		size={size}
		variant={variant}
		{...props}
	>
		{children ?? <Icon as={XIcon} className="size-4 text-muted-foreground" />}
	</Button>
);

export type ArtifactTitleProps = React.ComponentProps<typeof Text>;

export const ArtifactTitle = ({ className, ...props }: ArtifactTitleProps) => (
	<Text
		className={cn("font-medium text-foreground text-sm", className)}
		{...props}
	/>
);

export type ArtifactDescriptionProps = React.ComponentProps<typeof Text>;

export const ArtifactDescription = ({
	className,
	...props
}: ArtifactDescriptionProps) => (
	<Text className={cn("text-muted-foreground text-sm", className)} {...props} />
);

export type ArtifactActionsProps = React.ComponentProps<typeof View>;

export const ArtifactActions = ({
	className,
	...props
}: ArtifactActionsProps) => (
	<View className={cn("flex-row items-center gap-1", className)} {...props} />
);

export type ArtifactActionProps = ButtonProps & {
	tooltip?: string;
	label?: string;
	icon?: LucideIcon;
};

export const ArtifactAction = ({
	tooltip,
	label,
	icon,
	children,
	className,
	size = "icon",
	variant = "ghost",
	...props
}: ArtifactActionProps) => {
	const button = (
		<Button
			accessibilityLabel={label || tooltip}
			className={cn("size-8", className)}
			size={size}
			variant={variant}
			{...props}
		>
			{icon ? (
				<Icon as={icon} className="size-4 text-muted-foreground" />
			) : (
				children
			)}
		</Button>
	);

	if (tooltip) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent>
					<Text>{tooltip}</Text>
				</TooltipContent>
			</Tooltip>
		);
	}

	return button;
};

export type ArtifactContentProps = React.ComponentProps<typeof View>;

export const ArtifactContent = ({
	className,
	...props
}: ArtifactContentProps) => (
	<View className={cn("flex-1 p-4", className)} {...props} />
);
