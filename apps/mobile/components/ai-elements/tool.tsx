import { useControllableState } from "@rn-primitives/hooks";
import {
	CheckCircleIcon,
	ChevronDownIcon,
	CircleIcon,
	ClockIcon,
	WrenchIcon,
	XCircleIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { createContext, isValidElement, useContext, useMemo } from "react";
import { View } from "react-native";
import Animated, {
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useDerivedValue,
	withTiming,
} from "react-native-reanimated";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

export type ToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

export type ToolPart = {
	type: string;
	state: ToolState;
	input?: unknown;
	output?: unknown;
	errorText?: string;
	toolName?: string;
};

interface ToolContextValue {
	isOpen: boolean;
}

const ToolContext = createContext<ToolContextValue | null>(null);

const useTool = () => {
	const context = useContext(ToolContext);
	if (!context) {
		throw new Error("Tool components must be used within Tool");
	}
	return context;
};

export type ToolProps = React.ComponentProps<typeof Collapsible>;

export const Tool = ({
	className,
	open,
	defaultOpen,
	onOpenChange,
	...props
}: ToolProps) => {
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen ?? false,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;
	const contextValue = useMemo(() => ({ isOpen }), [isOpen]);

	return (
		<ToolContext.Provider value={contextValue}>
			<Collapsible
				className={cn("mb-4 w-full rounded-md border border-border", className)}
				onOpenChange={setIsOpen}
				open={isOpen}
				{...props}
			/>
		</ToolContext.Provider>
	);
};

export type ToolHeaderProps = React.ComponentProps<
	typeof CollapsibleTrigger
> & {
	title?: string;
	type: string;
	state: ToolState;
	toolName?: string;
};

const statusLabels: Record<ToolState, string> = {
	"input-available": "Running",
	"input-streaming": "Pending",
	"output-available": "Completed",
	"output-error": "Error",
};

const statusIcons: Record<ToolState, ReactNode> = {
	"input-available": <Icon as={ClockIcon} className="size-3" />,
	"input-streaming": <Icon as={CircleIcon} className="size-3" />,
	"output-available": (
		<Icon as={CheckCircleIcon} className="size-3 text-green-600" />
	),
	"output-error": <Icon as={XCircleIcon} className="size-3" />,
};

export const getStatusBadge = (status: ToolState) => (
	<Badge
		className="gap-1.5 rounded-full"
		variant={status === "output-error" ? "destructive" : "secondary"}
	>
		{statusIcons[status]}
		<Text>{statusLabels[status]}</Text>
	</Badge>
);

export const ToolHeader = ({
	className,
	title,
	type,
	state,
	toolName,
	...props
}: ToolHeaderProps) => {
	const { isOpen } = useTool();
	const derivedName =
		type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

	const progress = useDerivedValue(
		() =>
			isOpen
				? withTiming(1, { duration: 200 })
				: withTiming(0, { duration: 200 }),
		[isOpen],
	);
	const chevronStyle = useAnimatedStyle(
		() => ({
			transform: [{ rotate: `${progress.value * 180}deg` }],
		}),
		[progress],
	);

	return (
		<CollapsibleTrigger
			className={cn(
				"w-full flex-row items-center justify-between gap-4 p-3",
				className,
			)}
			{...props}
		>
			<View className="flex-row items-center gap-2">
				<Icon as={WrenchIcon} className="size-4 text-muted-foreground" />
				<Text className="font-medium text-sm">{title ?? derivedName}</Text>
				{getStatusBadge(state)}
			</View>
			<Animated.View style={chevronStyle}>
				<Icon as={ChevronDownIcon} className="size-4 text-muted-foreground" />
			</Animated.View>
		</CollapsibleTrigger>
	);
};

export type ToolContentProps = React.ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({
	className,
	children,
	...props
}: ToolContentProps) => (
	<CollapsibleContent {...props}>
		<TextClassContext.Provider value="text-popover-foreground">
			<Animated.View
				className={cn("gap-4 p-4", className)}
				entering={FadeIn.duration(200)}
				exiting={FadeOut.duration(150)}
			>
				{children}
			</Animated.View>
		</TextClassContext.Provider>
	</CollapsibleContent>
);

export type ToolInputProps = React.ComponentProps<typeof View> & {
	input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
	<View className={cn("gap-2 overflow-hidden", className)} {...props}>
		<Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			Parameters
		</Text>
		<CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
	</View>
);

export type ToolOutputProps = React.ComponentProps<typeof View> & {
	output: ToolPart["output"];
	errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
	className,
	output,
	errorText,
	...props
}: ToolOutputProps) => {
	if (!(output || errorText)) {
		return null;
	}

	let renderedOutput: ReactNode = null;

	if (isValidElement(output)) {
		renderedOutput = output;
	} else if (typeof output === "string") {
		renderedOutput = <CodeBlock code={output} language="json" />;
	} else if (typeof output === "object" && output !== null) {
		renderedOutput = (
			<CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
		);
	} else if (output !== undefined) {
		renderedOutput = <Text className="text-xs">{String(output)}</Text>;
	}

	return (
		<View className={cn("gap-2", className)} {...props}>
			<Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{errorText ? "Error" : "Result"}
			</Text>
			<View
				className={cn(
					"rounded-md",
					errorText ? "bg-destructive/10" : "bg-muted/50",
				)}
			>
				{errorText ? (
					<Text className="p-2 text-destructive text-xs">{errorText}</Text>
				) : null}
				{renderedOutput}
			</View>
		</View>
	);
};
