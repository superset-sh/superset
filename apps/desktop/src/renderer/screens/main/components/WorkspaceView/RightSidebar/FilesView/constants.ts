/** Row height for file tree items */
export const ROW_HEIGHT = 28;

/** Default tree indent in pixels */
export const TREE_INDENT = 16;

/** Number of items to overscan in virtualized list */
export const OVERSCAN_COUNT = 10;

/** Debounce time for search input in ms */
export const SEARCH_DEBOUNCE_MS = 150;

/** Patterns to ignore when listing directories */
export const DEFAULT_IGNORE_PATTERNS = [
	"**/node_modules/**",
	"**/.git/**",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.turbo/**",
	"**/coverage/**",
];

/** Special folder names that get custom icons */
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
