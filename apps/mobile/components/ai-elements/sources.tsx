import { useControllableState } from "@rn-primitives/hooks";
import * as Linking from "expo-linking";
import { BookIcon, ChevronDownIcon } from "lucide-react-native";
import { createContext, useContext, useMemo } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface SourcesContextValue {
	isOpen: boolean;
}

const SourcesContext = createContext<SourcesContextValue | null>(null);

const useSources = () => {
	const context = useContext(SourcesContext);
	if (!context) {
		throw new Error("Sources components must be used within Sources");
	}
	return context;
};

export type SourcesProps = React.ComponentProps<typeof Collapsible>;

export const Sources = ({
	className,
	open,
	defaultOpen,
	onOpenChange,
	...props
}: SourcesProps) => {
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen ?? false,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;
	const contextValue = useMemo(() => ({ isOpen }), [isOpen]);

	return (
		<SourcesContext.Provider value={contextValue}>
			<TextClassContext.Provider value="text-primary text-xs">
				<Collapsible
					className={cn("mb-4", className)}
					onOpenChange={setIsOpen}
					open={isOpen}
					{...props}
				/>
			</TextClassContext.Provider>
		</SourcesContext.Provider>
	);
};

export type SourcesTriggerProps = React.ComponentProps<
	typeof CollapsibleTrigger
> & {
	count: number;
};

export const SourcesTrigger = ({
	className,
	count,
	children,
	...props
}: SourcesTriggerProps) => {
	const { isOpen } = useSources();

	return (
		<CollapsibleTrigger
			className={cn("flex-row items-center gap-2", className)}
			{...props}
		>
			{children ?? (
				<>
					<Text className="font-medium">Used {count} sources</Text>
					<View
						style={isOpen ? { transform: [{ rotate: "180deg" }] } : undefined}
					>
						<Icon as={ChevronDownIcon} className="size-4 text-primary" />
					</View>
				</>
			)}
		</CollapsibleTrigger>
	);
};

export type SourcesContentProps = React.ComponentProps<
	typeof CollapsibleContent
>;

export const SourcesContent = ({
	className,
	children,
	...props
}: SourcesContentProps) => (
	<CollapsibleContent {...props}>
		<Animated.View
			className={cn("mt-3 flex-col gap-2 self-start", className)}
			entering={FadeIn.duration(200)}
			exiting={FadeOut.duration(150)}
		>
			{children}
		</Animated.View>
	</CollapsibleContent>
);

export type SourceProps = React.ComponentProps<typeof Pressable> & {
	href?: string;
	title?: string;
};

export const Source = ({ href, title, children, ...props }: SourceProps) => (
	<Pressable
		accessibilityRole="link"
		className="flex-row items-center gap-2"
		onPress={() => {
			if (href) {
				Linking.openURL(href);
			}
		}}
		{...props}
	>
		{children ?? (
			<>
				<Icon as={BookIcon} className="size-4 text-primary" />
				<Text className="font-medium">{title}</Text>
			</>
		)}
	</Pressable>
);
