import { beforeEach, describe, expect, it, mock } from "bun:test";

const askForMediaAccessMock = mock(async () => false);
const getMediaAccessStatusMock = mock(() => "not-determined");
const isTrustedAccessibilityClientMock = mock(() => false);
const openExternalMock = mock(async () => undefined);

mock.module("electron", () => ({
	shell: {
		openExternal: openExternalMock,
	},
	systemPreferences: {
		askForMediaAccess: askForMediaAccessMock,
		getMediaAccessStatus: getMediaAccessStatusMock,
		isTrustedAccessibilityClient: isTrustedAccessibilityClientMock,
	},
}));

const { createPermissionsRouter } = await import("./permissions");

function createCaller() {
	return createPermissionsRouter().createCaller({});
}

describe("permissions router", () => {
	beforeEach(() => {
		askForMediaAccessMock.mockClear();
		getMediaAccessStatusMock.mockClear();
		isTrustedAccessibilityClientMock.mockClear();
		openExternalMock.mockClear();
	});

	it("doesNotRequestMicrophoneOnStatusRead", async () => {
		const caller = createCaller();

		const status = await caller.getStatus();

		expect(status.microphone).toBe(false);
		expect(status.microphoneStatus).toBe("promptable");
		expect(getMediaAccessStatusMock).toHaveBeenCalledWith("microphone");
		expect(askForMediaAccessMock).not.toHaveBeenCalled();
		expect(openExternalMock).not.toHaveBeenCalled();
	});

	it("requestsMicrophoneOnlyThroughExplicitMutation", async () => {
		const caller = createCaller();

		await caller.requestMicrophone();

		if (process.platform === "darwin") {
			expect(askForMediaAccessMock).toHaveBeenCalledWith("microphone");
		} else {
			expect(openExternalMock).toHaveBeenCalledTimes(1);
		}
	});
});
