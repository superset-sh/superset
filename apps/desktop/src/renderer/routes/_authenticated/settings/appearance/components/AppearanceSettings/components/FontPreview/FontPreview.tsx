const EDITOR_FONT_PREVIEW_TEXT =
	"The quick brown fox jumps over the lazy dog.\n0O1lI {}[]() => !== +- @#$%";
const TERMINAL_FONT_PREVIEW_TEXT = "$ git status\n main   3  󰄬 1   bun test";

export function FontPreview({
	fontFamily,
	fontSize,
	variant,
}: {
	fontFamily: string;
	fontSize: number;
	variant: "editor" | "terminal";
}) {
	const isTerminal = variant === "terminal";
	const previewText = isTerminal
		? TERMINAL_FONT_PREVIEW_TEXT
		: EDITOR_FONT_PREVIEW_TEXT;
	return (
		<div
			className={`rounded-md border p-3 ${
				isTerminal ? "bg-[#1e1e1e] text-[#cccccc] border-[#333]" : "bg-muted/50"
			}`}
			style={{
				fontFamily: fontFamily || undefined,
				fontSize: `${fontSize}px`,
				lineHeight: 1.5,
				whiteSpace: "pre-wrap",
			}}
		>
			{previewText}
		</div>
	);
}
