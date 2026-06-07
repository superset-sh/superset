import { describe, expect, it, mock } from "bun:test";

mock.module("electron", () => ({
	shell: {
		openExternal: mock(async () => {}),
	},
	systemPreferences: {
		askForMediaAccess: mock(async () => false),
		getMediaAccessStatus: mock(() => "not-determined"),
		isTrustedAccessibilityClient: mock(() => false),
	},
}));

const {
	checkAccessibility,
	checkMicrophone,
	PERMISSION_SETTINGS_URLS,
	requestAccessibility,
	requestAppleEvents,
	requestFullDiskAccess,
	requestLocalNetwork,
	requestMicrophone,
} = await import("./native-permissions");

function createShellRecorder() {
	const openedUrls: string[] = [];

	return {
		openedUrls,
		shellApi: {
			openExternal: async (url: string) => {
				openedUrls.push(url);
			},
		},
	};
}

describe("native permissions", () => {
	it("checks Accessibility with the native trusted-client API", () => {
		expect(
			checkAccessibility({
				systemPreferencesApi: {
					isTrustedAccessibilityClient: (prompt) => prompt === false,
				},
			}),
		).toBe(true);
	});

	it("checks Microphone granted status", () => {
		expect(
			checkMicrophone({
				systemPreferencesApi: {
					getMediaAccessStatus: () => "granted",
				},
			}),
		).toBe(true);

		expect(
			checkMicrophone({
				systemPreferencesApi: {
					getMediaAccessStatus: () => "denied",
				},
			}),
		).toBe(false);
	});

	it("treats Microphone status errors as not granted", () => {
		expect(
			checkMicrophone({
				systemPreferencesApi: {
					getMediaAccessStatus: () => {
						throw new Error("unavailable");
					},
				},
			}),
		).toBe(false);
	});

	it("opens Full Disk Access settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestFullDiskAccess({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.fullDiskAccess]);
	});

	it("opens Accessibility settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestAccessibility({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.accessibility]);
	});

	it("returns granted when the native Microphone prompt grants access", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		const result = await requestMicrophone({
			shellApi,
			systemPreferencesApi: {
				askForMediaAccess: async () => true,
			},
		});

		if (process.platform === "darwin") {
			expect(result).toEqual({ granted: true });
			expect(openedUrls).toEqual([]);
		} else {
			expect(result).toEqual({ granted: false });
			expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.microphone]);
		}
	});

	it("opens Microphone settings when the native prompt does not grant access", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		const result = await requestMicrophone({
			shellApi,
			systemPreferencesApi: {
				askForMediaAccess: async () => false,
			},
		});

		expect(result).toEqual({ granted: false });
		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.microphone]);
	});

	it("opens Microphone settings when the native prompt fails", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		const result = await requestMicrophone({
			shellApi,
			systemPreferencesApi: {
				askForMediaAccess: async () => {
					throw new Error("unavailable");
				},
			},
		});

		expect(result).toEqual({ granted: false });
		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.microphone]);
	});

	it("opens Automation settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestAppleEvents({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.appleEvents]);
	});

	it("opens Local Network settings", async () => {
		const { openedUrls, shellApi } = createShellRecorder();

		await requestLocalNetwork({ shellApi });

		expect(openedUrls).toEqual([PERMISSION_SETTINGS_URLS.localNetwork]);
	});
});
