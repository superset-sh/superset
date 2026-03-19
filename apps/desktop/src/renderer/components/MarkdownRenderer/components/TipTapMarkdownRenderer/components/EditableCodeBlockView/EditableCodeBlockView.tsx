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
import {
	FILE_VIEW_CODE_BLOCK_LANGUAGES,
	getCodeBlockLanguageLabel,
} from "renderer/lib/tiptap/code-block-languages";

export function EditableCodeBlockView({
	node,
	updateAttributes,
	extension,
}: NodeViewProps) {
	const [copied, setCopied] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	const attrs = node.attrs as { language?: string };
	const htmlAttrs = extension.options.HTMLAttributes as { class?: string };

	const currentLanguage = attrs.language || "plaintext";
	const currentLabel = getCodeBlockLanguageLabel(
		FILE_VIEW_CODE_BLOCK_LANGUAGES,
		currentLanguage,
	);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(node.textContent);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (error) {
			console.error(
				"[EditableCodeBlockView] Failed to copy code block:",
				error,
			);
		}
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

			<code className="hljs block !bg-transparent">
				<NodeViewContent />
			</code>
		</NodeViewWrapper>
	);
}
