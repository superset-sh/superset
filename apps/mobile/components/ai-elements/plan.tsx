import { ChevronsUpDownIcon } from "lucide-react-native";
import { createContext, useContext, useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

interface PlanContextValue {
	isStreaming: boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
	const context = useContext(PlanContext);
	if (!context) {
		throw new Error("Plan components must be used within Plan");
	}
	return context;
};

export type PlanProps = React.ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
};

export const Plan = ({
	className,
	isStreaming = false,
	children,
	...props
}: PlanProps) => {
	const contextValue = useMemo(() => ({ isStreaming }), [isStreaming]);

	return (
		<PlanContext.Provider value={contextValue}>
			<Collapsible {...props}>
				<Card className={cn("shadow-none", className)}>{children}</Card>
			</Collapsible>
		</PlanContext.Provider>
	);
};

export type PlanHeaderProps = React.ComponentProps<typeof CardHeader>;

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
	<CardHeader
		className={cn("flex-row items-start justify-between", className)}
		{...props}
	/>
);

export type PlanTitleProps = Omit<
	React.ComponentProps<typeof CardTitle>,
	"children"
> & {
	children: string;
};

export const PlanTitle = ({ children, ...props }: PlanTitleProps) => {
	const { isStreaming } = usePlan();

	if (isStreaming) {
		return <Shimmer className="font-semibold text-base">{children}</Shimmer>;
	}

	return <CardTitle {...props}>{children}</CardTitle>;
};

export type PlanDescriptionProps = Omit<
	React.ComponentProps<typeof CardDescription>,
	"children"
> & {
	children: string;
};

export const PlanDescription = ({
	className,
	children,
	...props
}: PlanDescriptionProps) => {
	const { isStreaming } = usePlan();

	if (isStreaming) {
		return <Shimmer className={cn(className)}>{children}</Shimmer>;
	}

	return (
		<CardDescription className={cn(className)} {...props}>
			{children}
		</CardDescription>
	);
};

export type PlanActionProps = React.ComponentProps<typeof View>;

export const PlanAction = (props: PlanActionProps) => <View {...props} />;

export type PlanContentProps = React.ComponentProps<typeof CardContent>;

export const PlanContent = ({
	className,
	children,
	...props
}: PlanContentProps) => (
	<CollapsibleContent>
		<Animated.View
			entering={FadeIn.duration(200)}
			exiting={FadeOut.duration(150)}
		>
			<CardContent className={cn(className)} {...props}>
				{children}
			</CardContent>
		</Animated.View>
	</CollapsibleContent>
);

export type PlanFooterProps = React.ComponentProps<typeof CardFooter>;

export const PlanFooter = (props: PlanFooterProps) => <CardFooter {...props} />;

export type PlanTriggerProps = ButtonProps;

export const PlanTrigger = ({ className, ...props }: PlanTriggerProps) => (
	<CollapsibleTrigger asChild>
		<Button
			accessibilityLabel="Toggle plan"
			className={cn("h-8 w-8", className)}
			size="icon"
			variant="ghost"
			{...props}
		>
			<Icon as={ChevronsUpDownIcon} className="size-4" />
		</Button>
	</CollapsibleTrigger>
);
