const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsx: "tsx",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "tsx",
	json: "json",
	jsonc: "json",
	md: "markdown",
	mdx: "markdown",
	py: "python",
	rs: "rust",
	go: "go",
	css: "css",
	html: "html",
	yml: "yaml",
	yaml: "yaml",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	diff: "diff",
};

export function languageForPath(path: string): string {
	const extension = path.split(".").pop()?.toLowerCase() ?? "";
	return LANGUAGE_BY_EXTENSION[extension] ?? "text";
}
