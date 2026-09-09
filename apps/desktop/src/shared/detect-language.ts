// Files identified by name rather than extension, keyed by the lowercased
// filename stem so `Dockerfile.prod` and `Containerfile.base` still match.
const languageByStem = new Map([
	["dockerfile", "dockerfile"],
	["containerfile", "dockerfile"],
	["makefile", "makefile"],
	["gnumakefile", "makefile"],
]);

const languageByExtension = new Map(
	Object.entries({
		// JavaScript/TypeScript
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",

		// Web
		html: "html",
		htm: "html",
		astro: "html",
		css: "css",
		scss: "scss",
		less: "less",

		// Data formats
		json: "json",
		yaml: "yaml",
		yml: "yaml",
		xml: "xml",
		toml: "toml",

		// Markdown/Documentation
		md: "markdown",
		mdx: "markdown",

		// Shell
		sh: "shell",
		bash: "shell",
		zsh: "shell",
		fish: "shell",

		// Config
		dockerfile: "dockerfile",
		makefile: "makefile",

		// Other languages
		py: "python",
		rb: "ruby",
		go: "go",
		rs: "rust",
		java: "java",
		kt: "kotlin",
		swift: "swift",
		c: "c",
		cpp: "cpp",
		h: "c",
		hpp: "cpp",
		cs: "csharp",
		php: "php",
		sql: "sql",
		graphql: "graphql",
		gql: "graphql",
	}),
);

/**
 * Language id for the CodeMirror editor, from the file's basename: a known
 * extension wins (`Dockerfile.md` is markdown), then a known stem
 * (`Dockerfile.prod` is a Dockerfile), else `"plaintext"`.
 */
export function detectLanguage(filePath: string): string {
	const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? "";
	const [stem = "", ...rest] = fileName.split(".");
	const ext = rest.at(-1) ?? "";
	return (
		languageByExtension.get(ext) ?? languageByStem.get(stem) ?? "plaintext"
	);
}
