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

const LANGUAGES = [
	{ value: "plaintext", label: "Plaintext" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "typescript", label: "TypeScript" },
	{ value: "python", label: "Python" },
	{ value: "html", label: "HTML" },
	{ value: "css", label: "CSS" },
	{ value: "json", label: "JSON" },
	{ value: "bash", label: "Bash" },
	{ value: "sql", label: "SQL" },
	{ value: "go", label: "Go" },
	{ value: "rust", label: "Rust" },
	{ value: "java", label: "Java" },
	{ value: "c", label: "C" },
	{ value: "cpp", label: "C++" },
	{ value: "ruby", label: "Ruby" },
	{ value: "php", label: "PHP" },
	{ value: "yaml", label: "YAML" },
	{ value: "markdown", label: "Markdown" },
	{ value: "mermaid", label: "Mermaid" },
];

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
	const currentLabel =
		LANGUAGES.find((language) => language.value === currentLanguage)?.label ||
		"Plaintext";

	const handleCopy = async () => {
		await navigator.clipboard.writeText(node.textContent);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleLanguageChange = (language: string) => {
		updateAttributes({ language });
		setMenuOpen(false);
	};

	return (
		<NodeViewWrapper as="pre" className={`${htmlAttrs.class} relative group`}>
			<div
				className={`absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${menuOpen ? "opacity-100" : ""}`}
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
						{LANGUAGES.map((language) => (
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
