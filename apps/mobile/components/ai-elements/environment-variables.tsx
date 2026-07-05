import * as Clipboard from "expo-clipboard";
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react-native";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface EnvironmentVariablesContextType {
	showValues: boolean;
	setShowValues: (show: boolean) => void;
}

const noop = () => {
	// Default noop for context default value
};

const EnvironmentVariablesContext =
	createContext<EnvironmentVariablesContextType>({
		setShowValues: noop,
		showValues: false,
	});

export type EnvironmentVariablesProps = React.ComponentProps<typeof View> & {
	showValues?: boolean;
	defaultShowValues?: boolean;
	onShowValuesChange?: (show: boolean) => void;
};

export const EnvironmentVariables = ({
	showValues: controlledShowValues,
	defaultShowValues = false,
	onShowValuesChange,
	className,
	children,
	...props
}: EnvironmentVariablesProps) => {
	const [internalShowValues, setInternalShowValues] =
		useState(defaultShowValues);
	const showValues = controlledShowValues ?? internalShowValues;

	const setShowValues = useCallback(
		(show: boolean) => {
			setInternalShowValues(show);
			onShowValuesChange?.(show);
		},
		[onShowValuesChange],
	);

	const contextValue = useMemo(
		() => ({ setShowValues, showValues }),
		[setShowValues, showValues],
	);

	return (
		<EnvironmentVariablesContext.Provider value={contextValue}>
			<View
				className={cn(
					"rounded-lg border border-border bg-background",
					className,
				)}
				{...props}
			>
				{children}
			</View>
		</EnvironmentVariablesContext.Provider>
	);
};

export type EnvironmentVariablesHeaderProps = React.ComponentProps<typeof View>;

export const EnvironmentVariablesHeader = ({
	className,
	children,
	...props
}: EnvironmentVariablesHeaderProps) => (
	<View
		className={cn(
			"flex-row items-center justify-between border-border border-b px-4 py-3",
			className,
		)}
		{...props}
	>
		{children}
	</View>
);

export type EnvironmentVariablesTitleProps = React.ComponentProps<typeof Text>;

export const EnvironmentVariablesTitle = ({
	className,
	children,
	...props
}: EnvironmentVariablesTitleProps) => (
	<Text className={cn("font-medium text-sm", className)} {...props}>
		{children ?? "Environment Variables"}
	</Text>
);

export type EnvironmentVariablesToggleProps = Omit<
	React.ComponentProps<typeof Switch>,
	"checked" | "onCheckedChange"
> & {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
};

export const EnvironmentVariablesToggle = ({
	className,
	checked,
	onCheckedChange,
	...props
}: EnvironmentVariablesToggleProps) => {
	const { showValues, setShowValues } = useContext(EnvironmentVariablesContext);

	return (
		<View className={cn("flex-row items-center gap-2", className)}>
			<Icon
				as={showValues ? EyeIcon : EyeOffIcon}
				className="size-3.5 text-muted-foreground"
			/>
			<Switch
				accessibilityLabel="Toggle value visibility"
				checked={checked ?? showValues}
				onCheckedChange={onCheckedChange ?? setShowValues}
				{...props}
			/>
		</View>
	);
};

export type EnvironmentVariablesContentProps = React.ComponentProps<
	typeof View
>;

export const EnvironmentVariablesContent = ({
	className,
	children,
	...props
}: EnvironmentVariablesContentProps) => (
	<View className={className} {...props}>
		{children}
	</View>
);

interface EnvironmentVariableContextType {
	name: string;
	value: string;
}

const EnvironmentVariableContext =
	createContext<EnvironmentVariableContextType>({
		name: "",
		value: "",
	});

export type EnvironmentVariableGroupProps = React.ComponentProps<typeof View>;

export const EnvironmentVariableGroup = ({
	className,
	children,
	...props
}: EnvironmentVariableGroupProps) => (
	<View className={cn("flex-row items-center gap-2", className)} {...props}>
		{children}
	</View>
);

export type EnvironmentVariableNameProps = React.ComponentProps<typeof Text>;

export const EnvironmentVariableName = ({
	className,
	children,
	...props
}: EnvironmentVariableNameProps) => {
	const { name } = useContext(EnvironmentVariableContext);

	return (
		<Text className={cn("font-mono text-sm", className)} {...props}>
			{children ?? name}
		</Text>
	);
};

export type EnvironmentVariableValueProps = React.ComponentProps<typeof Text>;

export const EnvironmentVariableValue = ({
	className,
	children,
	...props
}: EnvironmentVariableValueProps) => {
	const { value } = useContext(EnvironmentVariableContext);
	const { showValues } = useContext(EnvironmentVariablesContext);

	const displayValue = showValues
		? value
		: "•".repeat(Math.min(value.length, 20));

	return (
		<Text
			className={cn("font-mono text-muted-foreground text-sm", className)}
			numberOfLines={1}
			{...props}
		>
			{children ?? displayValue}
		</Text>
	);
};

export type EnvironmentVariableProps = React.ComponentProps<typeof View> & {
	name: string;
	value: string;
};

export const EnvironmentVariable = ({
	name,
	value,
	className,
	children,
	...props
}: EnvironmentVariableProps) => {
	const envVarContextValue = useMemo(() => ({ name, value }), [name, value]);

	return (
		<EnvironmentVariableContext.Provider value={envVarContextValue}>
			<View
				className={cn(
					"flex-row items-center justify-between gap-4 px-4 py-3",
					className,
				)}
				{...props}
			>
				{children ?? (
					<>
						<View className="flex-row items-center gap-2">
							<EnvironmentVariableName />
						</View>
						<EnvironmentVariableValue className="shrink" />
					</>
				)}
			</View>
		</EnvironmentVariableContext.Provider>
	);
};

export type EnvironmentVariableCopyButtonProps = ButtonProps & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
	copyFormat?: "name" | "value" | "export";
};

export const EnvironmentVariableCopyButton = ({
	onCopy,
	onError,
	timeout = 2000,
	copyFormat = "value",
	children,
	className,
	...props
}: EnvironmentVariableCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { name, value } = useContext(EnvironmentVariableContext);

	const getTextToCopy = useCallback((): string => {
		const formatMap = {
			export: () => `export ${name}="${value}"`,
			name: () => name,
			value: () => value,
		};
		return formatMap[copyFormat]();
	}, [name, value, copyFormat]);

	const copyToClipboard = useCallback(async () => {
		try {
			await Clipboard.setStringAsync(getTextToCopy());
			setIsCopied(true);
			onCopy?.();
			timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	}, [getTextToCopy, onCopy, onError, timeout]);

	useEffect(
		() => () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		},
		[],
	);

	return (
		<Button
			className={cn("size-6 shrink-0", className)}
			onPress={copyToClipboard}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? (
				<Icon as={isCopied ? CheckIcon : CopyIcon} className="size-3" />
			)}
		</Button>
	);
};

export type EnvironmentVariableRequiredProps = React.ComponentProps<
	typeof Badge
>;

export const EnvironmentVariableRequired = ({
	className,
	children,
	...props
}: EnvironmentVariableRequiredProps) => (
	<Badge className={className} variant="secondary" {...props}>
		{children == null || typeof children === "string" ? (
			<Text>{children ?? "Required"}</Text>
		) : (
			children
		)}
	</Badge>
);
