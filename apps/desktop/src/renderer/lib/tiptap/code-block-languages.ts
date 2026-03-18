export interface CodeBlockLanguageOption {
	value: string;
	label: string;
}

export const COMMON_CODE_BLOCK_LANGUAGES: CodeBlockLanguageOption[] = [
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
];

export const FILE_VIEW_CODE_BLOCK_LANGUAGES: CodeBlockLanguageOption[] = [
	...COMMON_CODE_BLOCK_LANGUAGES,
	{ value: "mermaid", label: "Mermaid" },
];

export function getCodeBlockLanguageLabel(
	languages: CodeBlockLanguageOption[],
	value: string | undefined,
): string {
	return (
		languages.find((language) => language.value === value)?.label ?? "Plaintext"
	);
}
