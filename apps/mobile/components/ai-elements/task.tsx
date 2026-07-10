import { useControllableState } from "@rn-primitives/hooks";
import { ChevronDownIcon, SearchIcon } from "lucide-react-native";
import { createContext, useContext, useMemo } from "react";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type TaskItemFileProps = React.ComponentProps<typeof View>;

export const TaskItemFile = ({
	children,
	className,
	...props
}: TaskItemFileProps) => (
	<TextClassContext.Provider value="text-foreground text-xs">
		<View
			className={cn(
				"flex-row items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5",
				className,
			)}
			{...props}
		>
			{children}
		</View>
	</TextClassContext.Provider>
);

export type TaskItemProps = React.ComponentProps<typeof View>;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
	<TextClassContext.Provider value="text-muted-foreground text-sm">
		<View
			className={cn("flex-row flex-wrap items-center gap-1", className)}
			{...props}
		>
			{children}
		</View>
	</TextClassContext.Provider>
);

interface TaskContextValue {
	isOpen: boolean;
}

const TaskContext = createContext<TaskContextValue | null>(null);

const useTask = () => {
	const context = useContext(TaskContext);
	if (!context) {
		throw new Error("Task components must be used within Task");
	}
	return context;
};

export type TaskProps = React.ComponentProps<typeof Collapsible>;

export const Task = ({
	defaultOpen = true,
	open,
	onOpenChange,
	className,
	...props
}: TaskProps) => {
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;
	const contextValue = useMemo(() => ({ isOpen }), [isOpen]);

	return (
		<TaskContext.Provider value={contextValue}>
			<Collapsible
				className={cn(className)}
				onOpenChange={setIsOpen}
				open={isOpen}
				{...props}
			/>
		</TaskContext.Provider>
	);
};

export type TaskTriggerProps = React.ComponentProps<
	typeof CollapsibleTrigger
> & {
	title: string;
};

export const TaskTrigger = ({
	children,
	className,
	title,
	...props
}: TaskTriggerProps) => {
	const { isOpen } = useTask();

	return (
		<CollapsibleTrigger className={cn(className)} {...props}>
			{children ?? (
				<View className="w-full flex-row items-center gap-2">
					<Icon as={SearchIcon} className="size-4 text-muted-foreground" />
					<Text className="text-muted-foreground text-sm">{title}</Text>
					<View
						style={isOpen ? { transform: [{ rotate: "180deg" }] } : undefined}
					>
						<Icon
							as={ChevronDownIcon}
							className="size-4 text-muted-foreground"
						/>
					</View>
				</View>
			)}
		</CollapsibleTrigger>
	);
};

export type TaskContentProps = React.ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
	children,
	className,
	...props
}: TaskContentProps) => (
	<CollapsibleContent className={cn(className)} {...props}>
		<Animated.View
			className="mt-4 gap-2 border-muted border-l-2 pl-4"
			entering={FadeIn.duration(200)}
			exiting={FadeOut.duration(150)}
		>
			{children}
		</Animated.View>
	</CollapsibleContent>
);
