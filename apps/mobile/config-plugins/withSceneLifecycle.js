const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const TEMPLATE_CLASS = "class AppDelegate: ExpoAppDelegate {";
const PROVIDER_CLASS =
	"class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
const TEMPLATE_STARTUP = `    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
`;

// Mirrors @config-plugins/expo-uiscene-lifecycle, which is not on npm yet.
// Delete this plugin once it is, or on Expo SDK 58, which does this natively.
/** @type {import("expo/config-plugins").ConfigPlugin} */
const withSceneLifecycle = (config) => {
	config = withAppDelegate(config, (config) => {
		if (config.modResults.language !== "swift") {
			throw new Error("withSceneLifecycle: expected a Swift AppDelegate");
		}
		config.modResults.contents = rewriteAppDelegate(config.modResults.contents);
		return config;
	});

	return withInfoPlist(config, (config) => {
		config.modResults.UIApplicationSceneManifest = {
			UIApplicationSupportsMultipleScenes: false,
			UISceneConfigurations: {
				UIWindowSceneSessionRoleApplication: [
					{
						UISceneConfigurationName: "Default Configuration",
						UISceneDelegateClassName: "EXExpoAppSceneDelegate",
					},
				],
			},
		};
		return config;
	});
};

function rewriteAppDelegate(contents) {
	if (contents.includes(PROVIDER_CLASS)) return contents;
	if (
		!contents.includes(TEMPLATE_CLASS) ||
		!contents.includes(TEMPLATE_STARTUP)
	) {
		throw new Error(
			"withSceneLifecycle: AppDelegate.swift no longer matches the Expo SDK 57 template; update the plugin",
		);
	}
	return contents
		.replace(TEMPLATE_CLASS, PROVIDER_CLASS)
		.replace(TEMPLATE_STARTUP, "");
}

module.exports = { rewriteAppDelegate, withSceneLifecycle };
