import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const openExternalMock = mock((_url: string) => Promise.resolve());
const stopAllMock = mock(() => {});
const notificationsPortMock = mock(() => 43123);

const realSharedConstants = await import("shared/constants");
const realHostInfo = await import("@superset/shared/host-info");
mock.module("shared/constants", () => ({
	...realSharedConstants,
	PLATFORM: {
		...realSharedConstants.PLATFORM,
		IS_LINUX: true,
	},
}));

mock.module("electron", () => ({
	shell: {
		openExternal: openExternalMock,
	},
}));

mock.module("main/env.main", () => ({
	env: {
		NEXT_PUBLIC_API_URL: "https://api.example.com",
	},
}));

mock.module("main/lib/host-service-coordinator", () => ({
	getHostServiceCoordinator: () => ({
		stopAll: stopAllMock,
	}),
}));

mock.module("main/lib/notifications/runtime-port", () => ({
	getNotificationsPort: notificationsPortMock,
}));

mock.module("@superset/shared/host-info", () => ({
	...realHostInfo,
	getHostId: () => "host-1",
	getHostName: () => "host-name",
}));

const { createAuthRouter } = await import("./index");

describe("createAuthRouter signIn", () => {
	beforeEach(() => {
		openExternalMock.mockClear();
		stopAllMock.mockClear();
		notificationsPortMock.mockClear();
	});

	afterEach(() => {
		openExternalMock.mockClear();
		stopAllMock.mockClear();
		notificationsPortMock.mockClear();
	});

	it("uses the runtime notifications port for the Linux local callback", async () => {
		const caller = createAuthRouter().createCaller({});

		const result = await caller.signIn({ provider: "github" });

		expect(result).toEqual({ success: true });
		expect(notificationsPortMock).toHaveBeenCalledTimes(1);
		expect(openExternalMock).toHaveBeenCalledTimes(1);

		const openedUrl = openExternalMock.mock.calls.at(0)?.[0];
		expect(openedUrl).toBeDefined();

		const connectUrl = new URL(String(openedUrl));

		expect(connectUrl.searchParams.get("provider")).toBe("github");
		expect(connectUrl.searchParams.get("local_callback")).toBe(
			"http://127.0.0.1:43123/auth/callback",
		);
	});
});
