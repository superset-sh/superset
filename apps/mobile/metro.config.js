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

// Resolve react-native-worklets/.worklets/* via the Bundle Mode resolver
const defaultResolver = config.resolver.resolveRequest;
config = getBundleModeMetroConfig(config);
const bundleModeResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName.startsWith("react-native-worklets/.worklets/")) {
		return bundleModeResolver(context, moduleName, platform);
	}
	if (defaultResolver) {
		return defaultResolver(context, moduleName, platform);
	}
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withStorybook(
	withUniwindConfig(config, {
		cssEntryFile: "./global.css",
		dtsFile: "./uniwind-types.d.ts",
	}),
	{ configPath: "./.rnstorybook" },
);
