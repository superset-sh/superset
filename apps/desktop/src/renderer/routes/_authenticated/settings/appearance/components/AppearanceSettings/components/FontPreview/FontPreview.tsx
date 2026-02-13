const FONT_PREVIEW_TEXT =
	"The quick brown fox jumps over the lazy dog.\n0O1lI {}[]() => !== +- @#$%";

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
			{FONT_PREVIEW_TEXT}
		</div>
	);
}
