import type { CSSProperties } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "renderer/stores";
import { FontNotFoundBanner } from "./components/FontNotFoundBanner";

const CODE_PREVIEW = `// Strings, numbers, booleans & symbols
type Result<T> = { value: T; cached: boolean };
const active = items.filter((item) => item !== null);
const ready = active.length >= 3 && enabled !== false;
const label = ready ? "Ready →" : "Waiting…";
return { label, value: active ?? [] };
// => === !== >= <= != ??`;
const CODE_LINE_NUMBERS = CODE_PREVIEW.split("\n").map((_, index) =>
	String(index + 1),
);

const TERMINAL_LINES = [
	{ prompt: "~/agent $", command: "mastra dev" },
	{ output: "→ Loaded 3 tools · 1 agent · 0 workflows", muted: true },
	{ prompt: "~/agent $", command: "bun test" },
	{ output: " ✓ 14 tests passed · 0.24s" },
	{ prompt: "~/agent $", command: "git status --short" },
	{ output: " M src/settings/appearance.tsx", warning: true },
	{ output: "tip: use &&, ||, =>, !==, >= and <=", muted: true },
] as const;

function contrastPreviewOpacity(minimumContrast: number | null) {
	if (minimumContrast === 7) return 0.9;
	if (minimumContrast === 4.5) return 0.75;
	if (minimumContrast === 3) return 0.6;
	return 0.5;
}

export function FontPreview({
	fontFamily,
	fontSize,
	lineHeight,
	letterSpacing,
	fontWeight,
	ligatures,
	variant,
	isActive = false,
	isCustomFont,
	minimumContrast = null,
	cursorStyle = "block",
	cursorBlink = true,
}: {
	fontFamily: string;
	fontSize: number;
	lineHeight: number;
	letterSpacing: number;
	fontWeight: number;
	ligatures: boolean;
	variant: "editor" | "terminal";
	isActive?: boolean;
	isCustomFont: boolean;
	minimumContrast?: number | null;
	cursorStyle?: "block" | "bar" | "underline";
	cursorBlink?: boolean;
}) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";
	const isTerminal = variant === "terminal";
	const fontFamilyStyle = fontFamily || undefined;
	const cursorDimensions =
		cursorStyle === "bar"
			? { width: "2px", height: "1em" }
			: cursorStyle === "underline"
				? { width: "0.65em", height: "2px" }
				: { width: "0.65em", height: "1em" };
	const typographyStyle = {
		fontFamily: fontFamilyStyle,
		fontSize: `${fontSize}px`,
		lineHeight,
		letterSpacing: `${letterSpacing}px`,
		fontWeight,
		fontVariantLigatures: ligatures ? "normal" : "none",
	} satisfies CSSProperties;

	return (
		<div
			className={`overflow-hidden rounded-lg border bg-background text-foreground ${
				isActive ? "border-primary/50" : ""
			}`}
		>
			<div className="flex h-9 items-center gap-2 border-b bg-muted/50 px-3 text-[11px] text-muted-foreground">
				{isTerminal ? (
					<>
						<span className="size-2 rounded-full bg-primary" />
						<span>Terminal</span>
						<span className="ml-auto">zsh</span>
					</>
				) : (
					<>
						<span className="size-2 rounded-full bg-blue-500" />
						<span>settings.ts</span>
						<span className="ml-auto">TypeScript</span>
					</>
				)}
			</div>

			{isTerminal ? (
				<div
					className="h-56 overflow-hidden bg-muted/10 p-4"
					style={typographyStyle}
				>
					{TERMINAL_LINES.map((line) =>
						"command" in line ? (
							<div key={line.command}>
								<span className="text-primary">{line.prompt}</span>{" "}
								<span>{line.command}</span>
							</div>
						) : (
							<div
								key={line.output}
								className={
									"warning" in line && line.warning
										? "text-foreground/70"
										: undefined
								}
								style={
									"muted" in line && line.muted
										? { opacity: contrastPreviewOpacity(minimumContrast) }
										: undefined
								}
							>
								{line.output}
							</div>
						),
					)}
					<div>
						<span className="text-primary">~/agent $</span>{" "}
						<span
							aria-hidden="true"
							className={`inline-block bg-current align-text-bottom ${cursorBlink ? "animate-pulse" : ""}`}
							style={cursorDimensions}
						/>
					</div>
				</div>
			) : (
				<div className="flex h-56 overflow-hidden">
					<div
						aria-hidden="true"
						className="flex select-none flex-col border-r bg-muted/25 px-3 py-4 text-right text-muted-foreground/60"
						style={typographyStyle}
					>
						{CODE_LINE_NUMBERS.map((lineNumber) => (
							<span key={lineNumber}>{lineNumber}</span>
						))}
					</div>
					<SyntaxHighlighter
						language="typescript"
						style={
							(isDark ? oneDark : oneLight) as Record<string, CSSProperties>
						}
						customStyle={{
							...typographyStyle,
							flex: 1,
							margin: 0,
							padding: "16px",
							overflow: "hidden",
							background: "transparent",
						}}
						codeTagProps={{ style: typographyStyle }}
					>
						{CODE_PREVIEW}
					</SyntaxHighlighter>
				</div>
			)}
			<div className="flex h-7 items-center border-t bg-muted/30 px-3 text-[10px] text-muted-foreground">
				<span>{fontFamily}</span>
				<span className="ml-auto">
					{fontWeight} · {ligatures ? "Ligatures on" : "Ligatures off"}
					{isTerminal && minimumContrast !== null
						? ` · ${minimumContrast}:1 contrast`
						: ""}
				</span>
			</div>
			{isCustomFont && <FontNotFoundBanner fontFamily={fontFamily} />}
		</div>
	);
}
