import { mermaid } from "@streamdown/mermaid";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useState } from "react";
import {
	HiCheck,
	HiChevronDown,
	HiOutlineClipboard,
	HiOutlineCodeBracket,
	HiOutlineEye,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import {
	FILE_VIEW_CODE_BLOCK_LANGUAGES,
	getCodeBlockLanguageLabel,
} from "renderer/lib/tiptap/code-block-languages";
import { useTheme } from "renderer/stores";
import { Streamdown } from "streamdown";

const mermaidPlugins = { mermaid };

export function EditableCodeBlockView({
	node,
	updateAttributes,
	extension,
}: NodeViewProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const theme = useTheme();
	const isDark = theme?.type !== "light";

	const attrs = node.attrs as { language?: string };
	const htmlAttrs = extension.options.HTMLAttributes as { class?: string };

	const currentLanguage = attrs.language || "plaintext";
	const currentLabel = getCodeBlockLanguageLabel(
		FILE_VIEW_CODE_BLOCK_LANGUAGES,
		currentLanguage,
	);

	const isMermaid = currentLanguage === "mermaid";
	const mermaidSource = node.textContent;
	const mermaidHasContent = mermaidSource.trim().length > 0;
	const [mermaidMode, setMermaidMode] = useState<"preview" | "source">(() =>
		mermaidHasContent ? "preview" : "source",
	);
	const showMermaidPreview =
		isMermaid && mermaidMode === "preview" && mermaidHasContent;
	const showMermaidToggle = isMermaid && mermaidHasContent;

	const { copyToClipboard, copied } = useCopyToClipboard();
	const handleCopy = () => {
		copyToClipboard(node.textContent);
	};

	const handleLanguageChange = (language: string) => {
		updateAttributes({ language });
		setMenuOpen(false);
	};

	return (
		<NodeViewWrapper
			as="pre"
			className={`${htmlAttrs.class} relative group ${showMermaidPreview ? "!bg-transparent !p-0" : ""}`}
		>
			<div
				className={`absolute top-2 z-10 flex items-center gap-1 rounded-md border border-border bg-background/80 p-1 opacity-0 backdrop-blur-sm transition-opacity supports-[backdrop-filter]:bg-background/70 group-hover:opacity-100 group-focus-within:opacity-100 ${menuOpen ? "opacity-100" : ""} ${showMermaidPreview ? "left-2" : "right-2"}`}
			>
				{showMermaidToggle && (
					<button
						type="button"
						onClick={() =>
							setMermaidMode(mermaidMode === "preview" ? "source" : "preview")
						}
						aria-label={
							mermaidMode === "preview"
								? "Edit mermaid source"
								: "View mermaid diagram"
						}
						title={
							mermaidMode === "preview"
								? "Edit mermaid source"
								: "View mermaid diagram"
						}
						className="flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						{mermaidMode === "preview" ? (
							<HiOutlineCodeBracket className="h-3.5 w-3.5" />
						) : (
							<HiOutlineEye className="h-3.5 w-3.5" />
						)}
					</button>
				)}
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1 rounded px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
						>
							{currentLabel}
							<HiChevronDown className="h-3 w-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="max-h-64 w-40 overflow-y-auto"
					>
						{FILE_VIEW_CODE_BLOCK_LANGUAGES.map((language) => (
							<DropdownMenuItem
								key={language.value}
								onSelect={() => handleLanguageChange(language.value)}
								className="flex items-center justify-between"
							>
								<span>{language.label}</span>
								{language.value === currentLanguage && (
									<span className="text-xs">✓</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<button
					type="button"
					onClick={handleCopy}
					aria-label={copied ? "Copied code block" : "Copy code block"}
					title={copied ? "Copied code block" : "Copy code block"}
					className="flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					{copied ? (
						<HiCheck className="h-3.5 w-3.5 text-green-500" />
					) : (
						<HiOutlineClipboard className="h-3.5 w-3.5" />
					)}
				</button>
			</div>

			{showMermaidPreview && (
				<div contentEditable={false} className="w-full [&_.min-h-28]:min-h-80">
					<Streamdown
						mode="static"
						plugins={mermaidPlugins}
						mermaid={{ config: { theme: isDark ? "dark" : "default" } }}
					>
						{`\`\`\`\`mermaid\n${mermaidSource}\n\`\`\`\``}
					</Streamdown>
				</div>
			)}

			<code
				className="hljs block !bg-transparent"
				style={showMermaidPreview ? { display: "none" } : undefined}
			>
				<NodeViewContent />
			</code>
		</NodeViewWrapper>
	);
}
