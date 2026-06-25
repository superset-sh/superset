const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const { withStorybook } = require("@storybook/react-native/withStorybook");
const {
	getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

let config = getDefaultConfig(projectRoot);

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
	"@superset/tab-bar": path.resolve(projectRoot, "modules/tab-bar"),
};

// Worklets Bundle Mode (react-native-streamdown): resolves the generated
// react-native-worklets/.worklets/* modules and injects their entry points.
config = getBundleModeMetroConfig(config);

module.exports = withStorybook(
	withUniwindConfig(config, {
		cssEntryFile: "./global.css",
		dtsFile: "./uniwind-types.d.ts",
	}),
	{ configPath: "./.rnstorybook" },
);
