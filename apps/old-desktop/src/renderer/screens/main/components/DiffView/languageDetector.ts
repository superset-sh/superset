// Map file extensions to Prism language identifiers
export function detectLanguage(fileName: string): string {
	const extension = fileName.split(".").pop()?.toLowerCase();

	const languageMap: Record<string, string> = {
		// JavaScript/TypeScript
		js: "javascript",
		jsx: "jsx",
		ts: "typescript",
		tsx: "tsx",
		mjs: "javascript",
		cjs: "javascript",

		// Web
		html: "html",
		htm: "html",
		css: "css",
		scss: "scss",
		sass: "sass",
		less: "less",

		// Markup/Data
		json: "json",
		jsonc: "json",
		xml: "xml",
		yaml: "yaml",
		yml: "yaml",
		toml: "toml",
		md: "markdown",
		mdx: "markdown",

		// Programming languages
		py: "python",
		rb: "ruby",
		go: "go",
		rs: "rust",
		java: "java",
		kt: "kotlin",
		scala: "scala",
		c: "c",
		cpp: "cpp",
		cc: "cpp",
		cxx: "cpp",
		h: "c",
		hpp: "cpp",
		cs: "csharp",
		php: "php",
		swift: "swift",
		dart: "dart",

		// Shell/Config
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		fish: "bash",
		dockerfile: "docker",

		// Others
		sql: "sql",
		graphql: "graphql",
		gql: "graphql",
		vue: "vue",
		svelte: "svelte",
	};

	return languageMap[extension || ""] || "text";
}
