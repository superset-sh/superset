import { useControllableState } from "@rn-primitives/hooks";
import type { LucideIcon } from "lucide-react-native";
import { BrainIcon, ChevronDownIcon, DotIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface ChainOfThoughtContextValue {
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(
	null,
);

const useChainOfThought = () => {
	const context = useContext(ChainOfThoughtContext);
	if (!context) {
		throw new Error(
			"ChainOfThought components must be used within ChainOfThought",
		);
	}
	return context;
};

export type ChainOfThoughtProps = React.ComponentProps<typeof View> & {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export const ChainOfThought = memo(
	({
		className,
		open,
		defaultOpen = false,
		onOpenChange,
		children,
		...props
	}: ChainOfThoughtProps) => {
		const [isOpenState, setIsOpen] = useControllableState<boolean>({
			defaultProp: defaultOpen,
			onChange: onOpenChange,
			prop: open,
		});
		const isOpen = isOpenState ?? false;

		const chainOfThoughtContext = useMemo(
			() => ({ isOpen, setIsOpen }),
			[isOpen, setIsOpen],
		);

		return (
			<ChainOfThoughtContext.Provider value={chainOfThoughtContext}>
				<View className={cn("w-full gap-4", className)} {...props}>
					{children}
				</View>
			</ChainOfThoughtContext.Provider>
		);
	},
);

export type ChainOfThoughtHeaderProps = React.ComponentProps<
	typeof CollapsibleTrigger
> & {
	children?: ReactNode;
};

export const ChainOfThoughtHeader = memo(
	({ className, children, ...props }: ChainOfThoughtHeaderProps) => {
		const { isOpen, setIsOpen } = useChainOfThought();

		return (
			<Collapsible onOpenChange={setIsOpen} open={isOpen}>
				<TextClassContext.Provider value="text-muted-foreground text-sm">
					<CollapsibleTrigger
						className={cn("w-full flex-row items-center gap-2", className)}
						{...props}
					>
						<Icon as={BrainIcon} className="size-4 text-muted-foreground" />
						<Text className="flex-1 text-left">
							{children ?? "Chain of Thought"}
						</Text>
						<View
							style={isOpen ? { transform: [{ rotate: "180deg" }] } : undefined}
						>
							<Icon
								as={ChevronDownIcon}
								className="size-4 text-muted-foreground"
							/>
						</View>
					</CollapsibleTrigger>
				</TextClassContext.Provider>
			</Collapsible>
		);
	},
);

export type ChainOfThoughtStepProps = React.ComponentProps<typeof View> & {
	icon?: LucideIcon;
	label: ReactNode;
	description?: ReactNode;
	status?: "complete" | "active" | "pending";
};

const stepStatusStyles = {
	active: "text-foreground",
	complete: "text-muted-foreground",
	pending: "text-muted-foreground/50",
};

export const ChainOfThoughtStep = memo(
	({
		className,
		icon: StepIcon = DotIcon,
		label,
		description,
		status = "complete",
		children,
		...props
	}: ChainOfThoughtStepProps) => (
		<TextClassContext.Provider value={cn("text-sm", stepStatusStyles[status])}>
			<View className={cn("flex-row gap-2", className)} {...props}>
				<View className="items-center">
					<Icon
						as={StepIcon}
						className={cn("mt-0.5 size-4", stepStatusStyles[status])}
					/>
					<View className="mt-1 w-px flex-1 bg-border" />
				</View>
				<View className="flex-1 gap-2 overflow-hidden">
					{typeof label === "string" ? <Text>{label}</Text> : label}
					{description ? (
						typeof description === "string" ? (
							<Text className="text-muted-foreground text-xs">
								{description}
							</Text>
						) : (
							description
						)
					) : null}
					{children}
				</View>
			</View>
		</TextClassContext.Provider>
	),
);

export type ChainOfThoughtSearchResultsProps = React.ComponentProps<
	typeof View
>;

export const ChainOfThoughtSearchResults = memo(
	({ className, ...props }: ChainOfThoughtSearchResultsProps) => (
		<View
			className={cn("flex-row flex-wrap items-center gap-2", className)}
			{...props}
		/>
	),
);

export type ChainOfThoughtSearchResultProps = React.ComponentProps<
	typeof Badge
>;

export const ChainOfThoughtSearchResult = memo(
	({ className, children, ...props }: ChainOfThoughtSearchResultProps) => (
		<Badge
			className={cn("gap-1 px-2 py-0.5", className)}
			variant="secondary"
			{...props}
		>
			{typeof children === "string" ? (
				<Text className="font-normal text-xs">{children}</Text>
			) : (
				children
			)}
		</Badge>
	),
);

export type ChainOfThoughtContentProps = React.ComponentProps<
	typeof CollapsibleContent
>;

export const ChainOfThoughtContent = memo(
	({ className, children, ...props }: ChainOfThoughtContentProps) => {
		const { isOpen } = useChainOfThought();

		return (
			<Collapsible open={isOpen}>
				<CollapsibleContent {...props}>
					<Animated.View
						className={cn("mt-2 gap-3", className)}
						entering={FadeIn.duration(200)}
						exiting={FadeOut.duration(150)}
					>
						{children}
					</Animated.View>
				</CollapsibleContent>
			</Collapsible>
		);
	},
);

export type ChainOfThoughtImageProps = React.ComponentProps<typeof View> & {
	caption?: string;
};

export const ChainOfThoughtImage = memo(
	({ className, children, caption, ...props }: ChainOfThoughtImageProps) => (
		<View className={cn("mt-2 gap-2", className)} {...props}>
			<View className="max-h-[352px] items-center justify-center overflow-hidden rounded-lg bg-muted p-3">
				{children}
			</View>
			{caption ? (
				<Text className="text-muted-foreground text-xs">{caption}</Text>
			) : null}
		</View>
	),
);

ChainOfThought.displayName = "ChainOfThought";
ChainOfThoughtHeader.displayName = "ChainOfThoughtHeader";
ChainOfThoughtStep.displayName = "ChainOfThoughtStep";
ChainOfThoughtSearchResults.displayName = "ChainOfThoughtSearchResults";
ChainOfThoughtSearchResult.displayName = "ChainOfThoughtSearchResult";
ChainOfThoughtContent.displayName = "ChainOfThoughtContent";
ChainOfThoughtImage.displayName = "ChainOfThoughtImage";
