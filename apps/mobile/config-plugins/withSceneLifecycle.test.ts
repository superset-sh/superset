import { describe, expect, test } from "bun:test";
import { rewriteAppDelegate } from "./withSceneLifecycle";

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
	test("makes the app delegate a factory provider and drops its own window and start", () => {
		const out = rewriteAppDelegate(TEMPLATE);
		expect(out).toContain(
			"class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
		);
		expect(out).not.toContain("UIWindow(frame:");
		expect(out).not.toContain("startReactNative");
		expect(out).toContain("#if os(iOS) || os(tvOS)\n#endif");
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
