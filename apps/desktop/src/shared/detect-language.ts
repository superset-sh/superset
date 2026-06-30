export function detectLanguage(filePath: string): string {
	const fileName = filePath.split(/[/\\]/).pop()?.toLowerCase() ?? "";

	// Env files (`.env`, `.env.local`, `.env.production`, …) are dotfiles with
	// no usable extension, so match them by name. The `properties` mode
	// highlights `KEY=value` pairs and `#` comments.
	if (fileName === ".env" || fileName.startsWith(".env.")) {
		return "properties";
	}

	const ext = fileName.split(".").pop();

	const languageMap: Record<string, string> = {
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
	};

	return languageMap[ext || ""] || "plaintext";
}
