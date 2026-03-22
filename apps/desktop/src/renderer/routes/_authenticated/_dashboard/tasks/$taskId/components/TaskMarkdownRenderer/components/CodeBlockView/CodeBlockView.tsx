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
	COMMON_CODE_BLOCK_LANGUAGES,
	getCodeBlockLanguageLabel,
} from "renderer/lib/tiptap/code-block-languages";

export function CodeBlockView({
	node,
	updateAttributes,
	extension,
}: NodeViewProps) {
	const [menuOpen, setMenuOpen] = useState(false);

	const attrs = node.attrs as { language?: string };
	const htmlAttrs = extension.options.HTMLAttributes as { class?: string };

	const currentLanguage = attrs.language || "plaintext";
	const currentLabel = getCodeBlockLanguageLabel(
		COMMON_CODE_BLOCK_LANGUAGES,
		currentLanguage,
	);

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
				className={`absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${menuOpen ? "opacity-100" : ""}`}
			>
				<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1 h-6 px-2 text-xs bg-background/80 backdrop-blur border border-border rounded hover:bg-accent transition-colors"
						>
							{currentLabel}
							<HiChevronDown className="w-3 h-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="max-h-64 overflow-y-auto w-40"
					>
						{COMMON_CODE_BLOCK_LANGUAGES.map((lang) => (
							<DropdownMenuItem
								key={lang.value}
								onSelect={() => handleLanguageChange(lang.value)}
								className="flex items-center justify-between"
							>
								<span>{lang.label}</span>
								{lang.value === currentLanguage && (
									<span className="text-xs">✓</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>

				<button
					type="button"
					onClick={handleCopy}
					className="flex items-center justify-center h-6 w-6 bg-background/80 backdrop-blur border border-border rounded hover:bg-accent transition-colors"
				>
					{copied ? (
						<HiCheck className="w-3.5 h-3.5 text-green-500" />
					) : (
						<HiOutlineClipboard className="w-3.5 h-3.5" />
					)}
				</button>
			</div>

			<code className="hljs !bg-transparent block">
				<NodeViewContent />
			</code>
		</NodeViewWrapper>
	);
}
