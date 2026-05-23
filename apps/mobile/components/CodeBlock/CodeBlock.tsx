import { Check, Copy } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View, type ViewProps } from "react-native";
import { IconButton } from "@/components/IconButton";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type CodeBlockProps = ViewProps & {
	code: string;
	language?: string;
	/** Called when user taps the Copy button. Caller handles clipboard write. */
	onCopy?: (code: string) => void;
	/** When true, body is internally scrollable (>320pt content). */
	overflow?: boolean;
	/** No border variant (only sunken bg). */
	bare?: boolean;
};

/**
 * Fenced code block for assistant message stream (UC-RENDER-03 §A).
 *
 * Per mol-code-block spec:
 *  - header: language label (mono uppercase muted) + Copy IconButton
 *  - hairline divider via Separator
 *  - body: monospace text, optional internal scroll when overflow=true
 *  - Copy button briefly shows check icon + "Copied" for 1500ms
 *
 * Composes first-party IconButton + vendor Separator + Text.
 */
export function CodeBlock({
	code,
	language,
	onCopy,
	overflow,
	bare,
	className,
	...props
}: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		onCopy?.(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<View
			className={cn(
				"rounded-lg bg-muted overflow-hidden",
				!bare && "border border-border",
				className,
			)}
			{...props}
		>
			<View className="flex-row items-center justify-between px-3 py-1.5">
				{language ? (
					<Text className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
						{language}
					</Text>
				) : (
					<View />
				)}
				<IconButton
					icon={copied ? Check : Copy}
					accessibilityLabel={copied ? "Code copied" : "Copy code"}
					variant="ghost"
					size="xs"
					onPress={handleCopy}
					iconClassName={copied ? "text-state-live-fg" : undefined}
				/>
			</View>
			<Separator />
			{overflow ? (
				<ScrollView className="max-h-80" showsVerticalScrollIndicator>
					<View className="px-3 py-2">
						<Text className="font-mono text-xs text-foreground">{code}</Text>
					</View>
				</ScrollView>
			) : (
				<View className="px-3 py-2">
					<Text className="font-mono text-xs text-foreground">{code}</Text>
				</View>
			)}
		</View>
	);
}
