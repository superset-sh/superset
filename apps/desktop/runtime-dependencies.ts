type PackagedNodeModuleCopy = {
	filter: string[];
	from: string;
	to: string;
};

type ExternalizedRuntimeModule = {
	asarUnpackGlobs: string[];
	materialize: string[];
	packagedCopies: PackagedNodeModuleCopy[];
	specifier: string;
};

function copyWholeModule(moduleName: string): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

function copyModuleSubtree(
	moduleName: string,
	filter: string[],
): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${moduleName}`,
		to: `node_modules/${moduleName}`,
		filter,
	};
}

function copyNestedModule(
	parentModuleName: string,
	moduleName: string,
): PackagedNodeModuleCopy {
	return {
		from: `node_modules/${parentModuleName}/node_modules/${moduleName}`,
		to: `node_modules/${parentModuleName}/node_modules/${moduleName}`,
		filter: ["**/*"],
	};
}

const externalizedRuntimeModules: ExternalizedRuntimeModule[] = [
	{
		specifier: "better-sqlite3",
		materialize: ["better-sqlite3"],
		packagedCopies: [copyWholeModule("better-sqlite3")],
		asarUnpackGlobs: ["**/node_modules/better-sqlite3/**/*"],
	},
	{
		specifier: "node-pty",
		materialize: ["node-pty"],
		packagedCopies: [copyWholeModule("node-pty")],
		asarUnpackGlobs: ["**/node_modules/node-pty/**/*"],
	},
	{
		specifier: "native-keymap",
		materialize: ["native-keymap"],
		packagedCopies: [copyWholeModule("native-keymap")],
		asarUnpackGlobs: ["**/node_modules/native-keymap/**/*"],
	},
	{
		specifier: "@superset/macos-process-metrics",
		materialize: ["@superset/macos-process-metrics"],
		packagedCopies: [copyWholeModule("@superset/macos-process-metrics")],
		asarUnpackGlobs: ["**/node_modules/@superset/macos-process-metrics/**/*"],
	},
	{
		specifier: "@ast-grep/napi",
		materialize: ["@ast-grep/napi"],
		packagedCopies: [copyWholeModule("@ast-grep")],
		asarUnpackGlobs: ["**/node_modules/@ast-grep/napi*/**/*"],
	},
	{
		specifier: "@parcel/watcher",
		materialize: ["@parcel/watcher"],
		packagedCopies: [
			copyModuleSubtree("@parcel", ["watcher/**/*", "watcher-*/**/*"]),
		],
		asarUnpackGlobs: ["**/node_modules/@parcel/watcher*/**/*"],
	},
	{
		specifier: "libsql",
		materialize: ["libsql"],
		packagedCopies: [
			copyWholeModule("libsql"),
			copyWholeModule("@libsql"),
			copyWholeModule("@neon-rs"),
		],
		asarUnpackGlobs: ["**/node_modules/@libsql/**/*"],
	},
	{
		specifier: "@mastra/duckdb",
		materialize: [
			"@mastra/duckdb",
			"@duckdb/node-api",
			"@duckdb/node-bindings",
		],
		packagedCopies: [
			copyWholeModule("@mastra/duckdb"),
			copyWholeModule("@duckdb"),
		],
		asarUnpackGlobs: ["**/node_modules/@duckdb/**/*"],
	},
];

const trellisRuntimeModuleNames = [
	"@mindfoldhq/trellis",
	"@mindfoldhq/trellis-core",
	"chalk",
	"commander",
	"figlet",
	"giget",
	"inquirer",
	"@inquirer/external-editor",
	"chardet",
	"iconv-lite",
	"safer-buffer",
	"@inquirer/figures",
	"ansi-escapes",
	"environment",
	"cli-width",
	"mute-stream",
	"ora",
	"cli-cursor",
	"restore-cursor",
	"onetime",
	"signal-exit",
	"cli-spinners",
	"is-interactive",
	"is-unicode-supported",
	"log-symbols",
	"yoctocolors",
	"stdin-discarder",
	"string-width",
	"get-east-asian-width",
	"strip-ansi",
	"ansi-regex",
	"run-async",
	"rxjs",
	"tslib",
	"wrap-ansi",
	"ansi-styles",
	"color-convert",
	"color-name",
	"supports-color",
	"has-flag",
	"yoctocolors-cjs",
	"undici",
	"zod",
] as const;

const trellisRuntimeModuleCopies = trellisRuntimeModuleNames.map((moduleName) =>
	copyWholeModule(moduleName),
);

const trellisRuntimeNestedModuleCopies = [
	copyNestedModule("onetime", "mimic-fn"),
	copyNestedModule("restore-cursor", "signal-exit"),
];

const packagedSupportModules = [
	copyWholeModule("bindings"),
	copyWholeModule("file-uri-to-path"),
	copyWholeModule("detect-libc"),
	copyWholeModule("is-glob"),
	copyWholeModule("is-extglob"),
	copyWholeModule("picomatch"),
	copyWholeModule("node-addon-api"),
];

export const mainExternalizedDependencies = [
	...externalizedRuntimeModules.map((module) => module.specifier),
	"pg-native",
	// mastracode transitively loads @mastra/fastembed → onnxruntime-node, whose
	// native binding is loaded via a dynamic `require` that @rollup/plugin-commonjs
	// can't resolve at bundle time. Externalizing lets Node handle the require at
	// runtime from node_modules. Also keeps the bundle size sane (~20 MB chunk).
	"mastracode",
];

export const packagedNodeModuleCopies = [
	...externalizedRuntimeModules.flatMap((module) => module.packagedCopies),
	...packagedSupportModules,
];

export const packagedTrellisRuntimeResourceCopies = [
	...trellisRuntimeModuleCopies,
	...trellisRuntimeNestedModuleCopies,
];

export const packagedAsarUnpackGlobs = [
	...externalizedRuntimeModules.flatMap((module) => module.asarUnpackGlobs),
	"**/node_modules/bindings/**/*",
	"**/node_modules/file-uri-to-path/**/*",
	...trellisRuntimeModuleNames.map(
		(moduleName) => `**/node_modules/${moduleName}/**/*`,
	),
	"**/node_modules/onetime/node_modules/mimic-fn/**/*",
	"**/node_modules/restore-cursor/node_modules/signal-exit/**/*",
];

export const requiredMaterializedNodeModules = [
	...externalizedRuntimeModules.flatMap((module) => module.materialize),
	"bindings",
	"file-uri-to-path",
	"detect-libc",
	"is-glob",
	"is-extglob",
	"picomatch",
	"node-addon-api",
	...trellisRuntimeModuleNames,
];
