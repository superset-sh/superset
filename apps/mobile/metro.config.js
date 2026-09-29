const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withUniwindConfig } = require("uniwind/metro");
const { withStorybook } = require("@storybook/react-native/withStorybook");
const {
	getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

let config = getSentryExpoConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Watch the worklets Bundle Mode output directory (react-native-streamdown).
// Resolve through the bun symlink to the real store path so Metro's file map
// includes the generated worklet bundles.
const workletsDir = path.dirname(
	require.resolve("react-native-worklets/package.json"),
);
config.watchFolders.push(path.join(workletsDir, ".worklets"));

// Let Metro find modules from the monorepo root
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(monorepoRoot, "node_modules"),
];

// Enable package exports for better-auth
config.resolver.unstable_enablePackageExports = true;

// Resolve local Expo Modules (modules/ dir)
config.resolver.extraNodeModules = {
	"@superset/alert-prompt": path.resolve(projectRoot, "modules/alert-prompt"),
	"@superset/composer": path.resolve(projectRoot, "modules/composer"),
	"@superset/attachments-sheet": path.resolve(
		projectRoot,
		"modules/attachments-sheet",
	),
	"@superset/paste-input": path.resolve(projectRoot, "modules/paste-input"),
};

// Worklets Bundle Mode (react-native-streamdown): resolves the generated
// react-native-worklets/.worklets/* modules and injects their entry points.
config = getBundleModeMetroConfig(config);

config = withUniwindConfig(config, {
	cssEntryFile: "./global.css",
	dtsFile: "./uniwind-types.d.ts",
});

// uniwind and worklets Bundle Mode both alias `react-native`, and neither knows
// about the other.
//
// Bundle Mode points every `react-native` import at its own shim, except the
// shim's own import — that one is meant to fall through to the real module.
// uniwind has the same kind of guard, but it recognises react-native internals
// by looking for `/react-native/` in the importer's path, and the shim lives in
// `/react-native-worklets/`. So the fall-through lands in uniwind's component
// index instead, whose every export is a getter that re-requires
// `react-native` — straight back to the shim. Startup then dies in an infinite
// `get NativeModules` recursion before AppRegistry ever runs.
//
// Resolve the shim's own import to the real module and the cycle can't form.
// Everything else still goes through both resolvers untouched.
const workletsShimPath = path.join(
	path.dirname(require.resolve("react-native-worklets/package.json")),
	"bundleMode",
	"shims",
	"reactNativeShim.js",
);
const composedResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (
		moduleName === "react-native" &&
		context.originModulePath === workletsShimPath
	) {
		return context.resolveRequest(context, moduleName, platform);
	}
	return composedResolveRequest(context, moduleName, platform);
};

module.exports = withStorybook(config, { configPath: "./.rnstorybook" });
