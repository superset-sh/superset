import * as Clipboard from "expo-clipboard";
import { CheckIcon, CopyIcon } from "lucide-react-native";
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
import { Button, type ButtonProps } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface SnippetContextType {
	code: string;
}

const SnippetContext = createContext<SnippetContextType>({
	code: "",
});

export type SnippetProps = React.ComponentProps<typeof View> & {
	code: string;
};

export const Snippet = ({
	code,
	className,
	children,
	...props
}: SnippetProps) => {
	const contextValue = useMemo(() => ({ code }), [code]);

	return (
		<SnippetContext.Provider value={contextValue}>
			<TextClassContext.Provider value="font-mono text-sm">
				<View
					className={cn(
						"h-10 w-full flex-row items-center rounded-md border border-input bg-background px-1",
						className,
					)}
					{...props}
				>
					{children}
				</View>
			</TextClassContext.Provider>
		</SnippetContext.Provider>
	);
};

export type SnippetAddonProps = React.ComponentProps<typeof View>;

export const SnippetAddon = ({ className, ...props }: SnippetAddonProps) => (
	<View className={cn("flex-row items-center", className)} {...props} />
);

export type SnippetTextProps = React.ComponentProps<typeof Text>;

export const SnippetText = ({ className, ...props }: SnippetTextProps) => (
	<Text className={cn("pl-2 text-muted-foreground", className)} {...props} />
);

export type SnippetInputProps = React.ComponentProps<typeof Text>;

export const SnippetInput = ({
	className,
	children,
	...props
}: SnippetInputProps) => {
	const { code } = useContext(SnippetContext);

	return (
		<Text
			className={cn("flex-1 px-2 text-foreground", className)}
			numberOfLines={1}
			{...props}
		>
			{children ?? code}
		</Text>
	);
};

export type SnippetCopyButtonProps = ButtonProps & {
	onCopy?: () => void;
	onError?: (error: Error) => void;
	timeout?: number;
};

export const SnippetCopyButton = ({
	onCopy,
	onError,
	timeout = 2000,
	children,
	className,
	...props
}: SnippetCopyButtonProps) => {
	const [isCopied, setIsCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { code } = useContext(SnippetContext);

	const copyToClipboard = useCallback(async () => {
		if (isCopied) {
			return;
		}
		try {
			await Clipboard.setStringAsync(code);
			setIsCopied(true);
			onCopy?.();
			timeoutRef.current = setTimeout(() => setIsCopied(false), timeout);
		} catch (error) {
			onError?.(error as Error);
		}
	}, [code, onCopy, onError, timeout, isCopied]);

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
			accessibilityLabel="Copy"
			className={cn("size-7 shrink-0", className)}
			onPress={copyToClipboard}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children ?? (
				<Icon as={isCopied ? CheckIcon : CopyIcon} className="size-3.5" />
			)}
		</Button>
	);
};
