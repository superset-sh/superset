import {
	BottomSheetBackdrop,
	type BottomSheetBackdropProps,
	BottomSheetModal,
	type BottomSheetModalProps,
	BottomSheetModalProvider,
	BottomSheetScrollView,
	BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useControllableState } from "@rn-primitives/hooks";
import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Pressable, View } from "react-native";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ModelSelectorContextType {
	open: boolean;
	setOpen: (open: boolean) => void;
	value: string | undefined;
	setValue: (value: string) => void;
}

const ModelSelectorContext = createContext<ModelSelectorContextType | null>(
	null,
);

const useModelSelector = () => {
	const context = useContext(ModelSelectorContext);
	if (!context) {
		throw new Error(
			"ModelSelector components must be used within ModelSelector",
		);
	}
	return context;
};

interface ModelSelectorFilterContextType {
	query: string;
	setQuery: (query: string) => void;
	registerItem: (id: string, text: string) => void;
	unregisterItem: (id: string) => void;
	hasMatch: boolean;
}

const ModelSelectorFilterContext =
	createContext<ModelSelectorFilterContextType | null>(null);

const useModelSelectorFilter = () => {
	const context = useContext(ModelSelectorFilterContext);
	if (!context) {
		throw new Error(
			"ModelSelector list components must be used within ModelSelectorContent",
		);
	}
	return context;
};

const matchesQuery = (text: string, query: string) => {
	const trimmed = query.trim().toLowerCase();
	if (trimmed === "") {
		return true;
	}
	return text.toLowerCase().includes(trimmed);
};

export type ModelSelectorProps = PropsWithChildren<{
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
}>;

export const ModelSelector = ({
	open: openProp,
	defaultOpen,
	onOpenChange,
	value: valueProp,
	defaultValue,
	onValueChange,
	children,
}: ModelSelectorProps) => {
	const [open = false, setOpen] = useControllableState({
		defaultProp: defaultOpen ?? false,
		onChange: onOpenChange,
		prop: openProp,
	});
	const [value, setValue] = useControllableState({
		defaultProp: defaultValue,
		onChange: onValueChange,
		prop: valueProp,
	});

	const contextValue = useMemo<ModelSelectorContextType>(
		() => ({ open, setOpen, setValue, value }),
		[open, setOpen, setValue, value],
	);

	return (
		<ModelSelectorContext.Provider value={contextValue}>
			<BottomSheetModalProvider>{children}</BottomSheetModalProvider>
		</ModelSelectorContext.Provider>
	);
};

export type ModelSelectorTriggerProps = Omit<ButtonProps, "children"> & {
	children?: ReactNode;
};

export const ModelSelectorTrigger = ({
	className,
	variant = "outline",
	size = "sm",
	children,
	onPress,
	...props
}: ModelSelectorTriggerProps) => {
	const { setOpen } = useModelSelector();

	const handlePress = useCallback<NonNullable<typeof onPress>>(
		(event) => {
			onPress?.(event);
			setOpen(true);
		},
		[onPress, setOpen],
	);

	return (
		<Button
			accessibilityLabel="Select a model"
			className={cn("flex-row items-center gap-1.5 rounded-full", className)}
			onPress={handlePress}
			size={size}
			variant={variant}
			{...props}
		>
			{children}
			<Icon
				as={ChevronsUpDownIcon}
				className="size-3.5 text-muted-foreground"
			/>
		</Button>
	);
};

export type ModelSelectorValueProps = React.ComponentProps<typeof Text> & {
	placeholder?: string;
};

export const ModelSelectorValue = ({
	className,
	placeholder = "Select a model",
	children,
	...props
}: ModelSelectorValueProps) => {
	const { value } = useModelSelector();

	return (
		<Text
			className={cn(
				"text-sm",
				!(children ?? value) && "text-muted-foreground",
				className,
			)}
			numberOfLines={1}
			{...props}
		>
			{children ?? value ?? placeholder}
		</Text>
	);
};

export type ModelSelectorContentProps = Omit<
	Partial<BottomSheetModalProps>,
	"children"
> & {
	children: ReactNode;
	title?: string;
};

export const ModelSelectorContent = ({
	children,
	title = "Model Selector",
	snapPoints = ["65%"],
	onDismiss,
	...props
}: ModelSelectorContentProps) => {
	const { open, setOpen } = useModelSelector();
	const modalRef = useRef<BottomSheetModal>(null);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<Map<string, string>>(new Map());

	useEffect(() => {
		if (open) {
			modalRef.current?.present();
		} else {
			modalRef.current?.dismiss();
		}
	}, [open]);

	const handleDismiss = useCallback(() => {
		setQuery("");
		setOpen(false);
		onDismiss?.();
	}, [onDismiss, setOpen]);

	const registerItem = useCallback((id: string, text: string) => {
		setItems((previous) => {
			const next = new Map(previous);
			next.set(id, text);
			return next;
		});
	}, []);

	const unregisterItem = useCallback((id: string) => {
		setItems((previous) => {
			const next = new Map(previous);
			next.delete(id);
			return next;
		});
	}, []);

	const hasMatch = useMemo(
		() => [...items.values()].some((text) => matchesQuery(text, query)),
		[items, query],
	);

	const filterContextValue = useMemo<ModelSelectorFilterContextType>(
		() => ({ hasMatch, query, registerItem, setQuery, unregisterItem }),
		[hasMatch, query, registerItem, unregisterItem],
	);

	const renderBackdrop = useCallback(
		(backdropProps: BottomSheetBackdropProps) => (
			<BottomSheetBackdrop
				{...backdropProps}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				pressBehavior="close"
			/>
		),
		[],
	);

	return (
		<BottomSheetModal
			accessibilityLabel={title}
			backdropComponent={renderBackdrop}
			backgroundStyle={{
				backgroundColor: THEME.dark.popover,
				borderColor: THEME.dark.border,
				borderWidth: 1,
			}}
			enableDynamicSizing={false}
			handleIndicatorStyle={{ backgroundColor: THEME.dark.mutedForeground }}
			onDismiss={handleDismiss}
			ref={modalRef}
			snapPoints={snapPoints}
			{...props}
		>
			<ModelSelectorFilterContext.Provider value={filterContextValue}>
				<View className="flex-1">{children}</View>
			</ModelSelectorFilterContext.Provider>
		</BottomSheetModal>
	);
};

export type ModelSelectorInputProps = React.ComponentProps<
	typeof BottomSheetTextInput
> & {
	className?: string;
};

export const ModelSelectorInput = ({
	className,
	placeholder = "Search models...",
	...props
}: ModelSelectorInputProps) => {
	const { query, setQuery } = useModelSelectorFilter();

	return (
		<View
			className={cn(
				"flex-row items-center gap-2 border-border border-b px-4 pb-3",
				className,
			)}
		>
			<Icon as={SearchIcon} className="size-4 text-muted-foreground" />
			<BottomSheetTextInput
				accessibilityLabel="Search models"
				autoCapitalize="none"
				autoCorrect={false}
				onChangeText={setQuery}
				placeholder={placeholder}
				placeholderTextColor={THEME.dark.mutedForeground}
				style={{
					color: THEME.dark.foreground,
					flex: 1,
					fontSize: 16,
					paddingVertical: 8,
				}}
				value={query}
				{...props}
			/>
		</View>
	);
};

export type ModelSelectorListProps = React.ComponentProps<
	typeof BottomSheetScrollView
>;

export const ModelSelectorList = ({
	children,
	...props
}: ModelSelectorListProps) => (
	<BottomSheetScrollView
		contentContainerStyle={{ padding: 8 }}
		keyboardShouldPersistTaps="handled"
		{...props}
	>
		{children}
	</BottomSheetScrollView>
);

export type ModelSelectorEmptyProps = React.ComponentProps<typeof View>;

export const ModelSelectorEmpty = ({
	className,
	children,
	...props
}: ModelSelectorEmptyProps) => {
	const { hasMatch } = useModelSelectorFilter();

	if (hasMatch) {
		return null;
	}

	return (
		<View className={cn("items-center px-4 py-6", className)} {...props}>
			{children ?? (
				<Text className="text-center text-muted-foreground text-sm">
					No models found.
				</Text>
			)}
		</View>
	);
};

export type ModelSelectorGroupProps = React.ComponentProps<typeof View>;

export const ModelSelectorGroup = ({
	className,
	...props
}: ModelSelectorGroupProps) => (
	<View className={cn("py-1", className)} {...props} />
);

export type ModelSelectorSeparatorProps = React.ComponentProps<typeof View>;

export const ModelSelectorSeparator = ({
	className,
	...props
}: ModelSelectorSeparatorProps) => (
	<View className={cn("my-1 h-px bg-border", className)} {...props} />
);

export type ModelSelectorItemProps = Omit<
	React.ComponentProps<typeof Pressable>,
	"children"
> & {
	value: string;
	keywords?: string[];
	onSelect?: (value: string) => void;
	children?: ReactNode;
};

export const ModelSelectorItem = ({
	value,
	keywords,
	onSelect,
	onPress,
	className,
	children,
	...props
}: ModelSelectorItemProps) => {
	const id = useId();
	const selector = useModelSelector();
	const { query, registerItem, unregisterItem } = useModelSelectorFilter();
	const searchText = [value, ...(keywords ?? [])].join(" ");

	useEffect(() => {
		registerItem(id, searchText);
		return () => unregisterItem(id);
	}, [id, registerItem, searchText, unregisterItem]);

	const handlePress = useCallback<
		NonNullable<React.ComponentProps<typeof Pressable>["onPress"]>
	>(
		(event) => {
			onPress?.(event);
			onSelect?.(value);
			selector.setValue(value);
			selector.setOpen(false);
		},
		[onPress, onSelect, selector, value],
	);

	if (!matchesQuery(searchText, query)) {
		return null;
	}

	const isSelected = selector.value === value;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected: isSelected }}
			className={cn(
				"flex-row items-center gap-2 rounded-md px-3 py-3 active:bg-accent",
				className,
			)}
			onPress={handlePress}
			{...props}
		>
			{children}
			{isSelected ? (
				<Icon as={CheckIcon} className="ml-auto size-4 text-foreground" />
			) : null}
		</Pressable>
	);
};

export type ModelSelectorNameProps = React.ComponentProps<typeof Text>;

export const ModelSelectorName = ({
	className,
	...props
}: ModelSelectorNameProps) => (
	<Text
		className={cn("flex-1 text-foreground text-sm", className)}
		numberOfLines={1}
		{...props}
	/>
);
