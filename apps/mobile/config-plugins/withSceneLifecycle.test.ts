import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { rewriteAppDelegate, SCENE_DELEGATE } from "./withSceneLifecycle";

// Expo 57's template AppDelegate, trimmed to what the rewrite touches.
const TEMPLATE = `class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe("withSceneLifecycle", () => {
	test("hands React Native's start to the scene delegate", () => {
		const out = rewriteAppDelegate(TEMPLATE);
		expect(out).not.toContain("UIWindow(frame:");
		expect(out).not.toContain("startReactNative");
		expect(out).toContain(
			"var launchOptions: [UIApplication.LaunchOptionsKey: Any]?",
		);
		expect(out).toContain("self.launchOptions = launchOptions");
	});

	test("is idempotent", () => {
		const once = rewriteAppDelegate(TEMPLATE);
		expect(rewriteAppDelegate(once)).toBe(once);
	});

	test("fails loudly when the template changes", () => {
		expect(() =>
			rewriteAppDelegate(TEMPLATE.replace("UIScreen.main.bounds", "x")),
		).toThrow(/no longer matches/);
	});
});

/**
 * Swift's names for the UIKit launch-option keys the scene delegate writes,
 * mapped to the Objective-C constants the readers look up.
 */
const SWIFT_KEY = {
	UIApplicationLaunchOptionsURLKey: "options[.url] = url",
	UIApplicationLaunchOptionsUserActivityDictionaryKey:
		"options[.userActivityDictionary] = [",
	UIApplicationLaunchOptionsUserActivityTypeKey:
		"UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType",
	UIApplicationLaunchOptionsUserActivityKey:
		'"UIApplicationLaunchOptionsUserActivityKey": activity',
};

function nativeSource(pkg: string, file: string, from?: string): string {
	const root = dirname(
		require.resolve(`${pkg}/package.json`, from ? { paths: [from] } : {}),
	);
	return readFileSync(join(root, file), "utf8");
}

// A cold launch no longer carries its URL or universal link in the app's
// launch options under scenes; the scene delegate rebuilds them. These pin
// that rebuild to the keys the readers actually look up, so a wrong key
// cannot silently drop a cold-start link.
describe("withSceneLifecycle cold-launch options", () => {
	const linking = nativeSource(
		"react-native",
		"Libraries/LinkingIOS/RCTLinkingManager.mm",
	);
	const devLauncher = nativeSource(
		"expo-dev-launcher",
		"ios/EXDevLauncherController.m",
		dirname(require.resolve("expo-dev-client/package.json")),
	);

	test("a custom-scheme URL lands where Linking.getInitialURL reads it", () => {
		expect(linking).toContain(
			"self.bridge.launchOptions[UIApplicationLaunchOptionsURLKey]",
		);
		expect(SCENE_DELEGATE).toContain(
			SWIFT_KEY.UIApplicationLaunchOptionsURLKey,
		);
	});

	test("a universal link lands where Linking.getInitialURL reads it", () => {
		// RCTLinkingManager: launchOptions[UserActivityDictionaryKey]
		// [UserActivityTypeKey] == NSUserActivityTypeBrowsingWeb, then
		// [@"UIApplicationLaunchOptionsUserActivityKey"].webpageURL.
		expect(linking).toContain(
			"self.bridge.launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey]",
		);
		expect(linking).toContain(
			"userActivityDictionary[UIApplicationLaunchOptionsUserActivityTypeKey] isEqual:NSUserActivityTypeBrowsingWeb",
		);
		expect(linking).toContain(
			'userActivityDictionary[@"UIApplicationLaunchOptionsUserActivityKey"]).webpageURL',
		);
		for (const written of [
			SWIFT_KEY.UIApplicationLaunchOptionsUserActivityDictionaryKey,
			SWIFT_KEY.UIApplicationLaunchOptionsUserActivityTypeKey,
			SWIFT_KEY.UIApplicationLaunchOptionsUserActivityKey,
		]) {
			expect(SCENE_DELEGATE).toContain(written);
		}
	});

	test("the dev launcher reads the same keys", () => {
		expect(devLauncher).toContain(
			"launchOptions[UIApplicationLaunchOptionsURLKey]",
		);
		expect(devLauncher).toContain(
			"launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey][UIApplicationLaunchOptionsUserActivityTypeKey]",
		);
		expect(devLauncher).toContain(
			'launchOptions[UIApplicationLaunchOptionsUserActivityDictionaryKey][@"UIApplicationLaunchOptionsUserActivityKey"]',
		);
	});

	test("the rebuilt options reach React Native", () => {
		expect(SCENE_DELEGATE).toMatch(
			/factory\.startReactNative\([\s\S]*launchOptions: launchOptions\(\s*base: appDelegate\.launchOptions,\s*connectionOptions: connectionOptions\)\)/,
		);
		expect(SCENE_DELEGATE).toContain(
			"connectionOptions.urlContexts.first?.url",
		);
		expect(SCENE_DELEGATE).toContain("connectionOptions.userActivities.first");
	});
});
