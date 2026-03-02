export const ROW_HEIGHT = 28;
export const SEARCH_RESULT_ROW_HEIGHT = 40;
export const TREE_INDENT = 16;
export const OVERSCAN_COUNT = 10;
export const SEARCH_DEBOUNCE_MS = 150;
export const SEARCH_RESULT_LIMIT = 200;

export const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
];

export const SPECIAL_FOLDERS = {
	node_modules: "package",
	".git": "git",
	src: "folder-src",
	components: "folder-components",
	lib: "folder-lib",
	utils: "folder-utils",
	hooks: "folder-hooks",
	styles: "folder-styles",
	public: "folder-public",
	assets: "folder-assets",
	tests: "folder-test",
	__tests__: "folder-test",
	docs: "folder-docs",
} as const;
