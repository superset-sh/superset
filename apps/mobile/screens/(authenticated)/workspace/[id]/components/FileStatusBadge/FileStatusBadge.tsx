import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

// Mirrors the desktop changes-view language (ChangesView/utils/status.tsx):
// VS Code-style boxed glyphs — green +, yellow dot, red −, blue →, purple copy.
const STATUS_STYLE: Record<string, { glyph: string; className: string }> = {
	added: { glyph: "+", className: "border-green-400 text-green-400" },
	untracked: { glyph: "+", className: "border-green-400 text-green-400" },
	modified: { glyph: "•", className: "border-yellow-400 text-yellow-400" },
	deleted: { glyph: "−", className: "border-red-400 text-red-400" },
	renamed: { glyph: "→", className: "border-blue-400 text-blue-400" },
	copied: { glyph: "⧉", className: "border-purple-400 text-purple-400" },
};

const FALLBACK_STYLE = {
	glyph: "•",
	className: "border-muted-foreground text-muted-foreground",
};

export function FileStatusBadge({ status }: { status: string }) {
	const style = STATUS_STYLE[status] ?? FALLBACK_STYLE;
	return (
		<View
			className={cn(
				"size-5 items-center justify-center rounded border-[1.5px]",
				style.className,
			)}
		>
			<Text className={cn("font-bold text-[11px]", style.className)}>
				{style.glyph}
			</Text>
		</View>
	);
}
