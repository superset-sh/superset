export function detectLanguage(filePath: string): string {
	// Callers pass a full path (e.g. "/repo/Dockerfile"), so we must isolate the
	// file name before inspecting it. Splitting the whole path on "." broke
	// extensionless files recognized by name (Dockerfile, Makefile) and files
	// under directories whose names contain dots (e.g. "my.pkg/README").
	const fileName = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";

	// Files identified by their full name rather than an extension.
	const fileNameMap: Record<string, string> = {
		dockerfile: "dockerfile",
		makefile: "makefile",
	};
	const byName = fileNameMap[fileName];
	if (byName) {
		return byName;
	}

	const ext = fileName.includes(".") ? fileName.split(".").pop() : undefined;

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
