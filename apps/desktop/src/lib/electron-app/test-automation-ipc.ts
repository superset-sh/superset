export const DESKTOP_TEST_AUTOMATION_CHANNEL =
	"superset:desktop-test-automation";

export type DesktopTestAutomationCommand =
	| { type: "ping" }
	| { type: "getEnvironment" }
	| { type: "getWindowInfo" }
	| { type: "getAuthState" }
	| { type: "getStoredAuthToken" }
	| {
			type: "seedAuthToken";
			token: string;
			expiresAt: string;
	  }
	| { type: "clearAuthToken" };
