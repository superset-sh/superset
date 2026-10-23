import { describe, expect, it } from "bun:test";
import { arePostHogFlagsSettled } from "renderer/hooks/usePostHogFlagsSettled";
import { isCloudWorkspaceListLive } from "./useCloudWorkspaces.utils";

function liveWith(
	client: Parameters<typeof arePostHogFlagsSettled>[0],
	flagEnabled: boolean | undefined = undefined,
) {
	return isCloudWorkspaceListLive({
		flagEnabled,
		flagsSettled: arePostHogFlagsSettled(client),
		queryAnsweredInThisWindow: false,
	});
}

describe("isCloudWorkspaceListLive", () => {
	it.each([
		["PostHog was never initialized", { __loaded: false }],
		["there is no PostHog client", undefined],
		[
			"the flags request answered or failed without the flag",
			{ __loaded: true, featureFlags: { hasLoadedFlags: true } },
		],
	])("treats cloud workspaces as not applicable when %s", (_name, client) => {
		expect(liveWith(client)).toBe(true);
	});

	it("waits while PostHog is still loading its flags", () => {
		expect(
			liveWith({ __loaded: true, featureFlags: { hasLoadedFlags: false } }),
		).toBe(false);
	});

	it("is live when the flag is off", () => {
		expect(
			liveWith(
				{ __loaded: true, featureFlags: { hasLoadedFlags: false } },
				false,
			),
		).toBe(true);
	});

	it("needs the server's answer when the flag is on", () => {
		const settled = { __loaded: true, featureFlags: { hasLoadedFlags: true } };
		expect(liveWith(settled, true)).toBe(false);
		expect(
			isCloudWorkspaceListLive({
				flagEnabled: true,
				flagsSettled: true,
				queryAnsweredInThisWindow: true,
			}),
		).toBe(true);
	});
});
