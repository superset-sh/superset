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
import { HiCheck, HiChevronDown, HiOutlineClipboard } from "react-icons/hi2";
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
	const showMermaidPreview = isMermaid && mermaidSource.trim().length > 0;

	const { copyToClipboard, copied } = useCopyToClipboard();
	const handleCopy = () => {
		copyToClipboard(node.textContent);
	};

	const handleLanguageChange = (language: string) => {
		updateAttributes({ language });
		setMenuOpen(false);
	};

	return (
		<NodeViewWrapper as="pre" className={`${htmlAttrs.class} relative group`}>
			<div
				className={`absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${menuOpen ? "opacity-100" : ""}`}
			>
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex h-6 items-center gap-1 rounded border border-border bg-background/80 px-2 text-xs backdrop-blur transition-colors hover:bg-accent"
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
					className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background/80 backdrop-blur transition-colors hover:bg-accent"
				>
					{copied ? (
						<HiCheck className="h-3.5 w-3.5 text-green-500" />
					) : (
						<HiOutlineClipboard className="h-3.5 w-3.5" />
					)}
				</button>
			</div>

			{showMermaidPreview && (
				<div
					contentEditable={false}
					className="mb-3 flex justify-center rounded-md bg-background p-3"
				>
					<Streamdown
						mode="static"
						plugins={mermaidPlugins}
						mermaid={{ config: { theme: isDark ? "dark" : "default" } }}
					>
						{`\`\`\`mermaid\n${mermaidSource}\n\`\`\``}
					</Streamdown>
				</div>
			)}

			<code className="hljs block !bg-transparent">
				<NodeViewContent />
			</code>
		</NodeViewWrapper>
	);
}
