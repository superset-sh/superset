import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type ClickableFilePathProps = {
	/** Full file path, used for the accessibility label. */
	path: string;
	/** Display text. Defaults to the basename of `path`. */
	display?: string;
	/** When provided, renders as a pressable element that receives the full path. */
	onPress?: (path: string) => void;
	className?: string;
};

/**
 * Displays a file path (or its basename) as inline mono text.
 *
 * Rendered as a `Text` (not a `Pressable`) so it can safely nest inside
 * other `Text` elements, e.g. within a sentence or a collapsible trigger row.
 * On web/desktop this opens the file in the editor; on mobile the press
 * behavior is supplied by the caller via `onPress`.
 */
export function ClickableFilePath({
	path,
	display,
	onPress,
	className,
}: ClickableFilePathProps) {
	const label =
		display ?? (path.includes("/") ? path.split("/").pop() || path : path);

	if (!onPress) {
		return <Text className={cn("font-mono", className)}>{label}</Text>;
	}

	return (
		<Text
			accessibilityLabel={`Open ${path}`}
			accessibilityRole="button"
			className={cn("font-mono underline", className)}
			onPress={() => onPress(path)}
		>
			{label}
		</Text>
	);
}
