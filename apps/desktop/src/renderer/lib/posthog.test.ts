import { afterEach, describe, expect, mock, test } from "bun:test";
import { env } from "../env.renderer";
import {
	__resetPostHogForTests,
	__setPostHogClientForTests,
	initPostHog,
	isPostHogEnabled,
	type LoadedPostHogClient,
	posthog,
} from "./posthog";

const originalPostHogKey = env.NEXT_PUBLIC_POSTHOG_KEY;

afterEach(() => {
	env.NEXT_PUBLIC_POSTHOG_KEY = originalPostHogKey;
	__resetPostHogForTests();
});

function createMockClient() {
	const featureFlagCallbacks = new Set<() => void>();
	const featureFlags = new Map<string, boolean | undefined>();
	const featureFlagPayloads = new Map<string, unknown>();

	const client: LoadedPostHogClient = {
		init: mock(() => {}),
		capture: mock(() => {}),
		identify: mock(() => {}),
		reset: mock(() => {}),
		register: mock(() => {}),
		reloadFeatureFlags: mock(() => {
			for (const callback of featureFlagCallbacks) {
				callback();
			}
		}),
		opt_in_capturing: mock(() => {}),
		opt_out_capturing: mock(() => {}),
		isFeatureEnabled: mock((flag: string) => featureFlags.get(flag)),
		getFeatureFlagPayload: mock((flag: string) =>
			featureFlagPayloads.get(flag),
		),
		onFeatureFlags: mock((callback: () => void) => {
			featureFlagCallbacks.add(callback);
			return () => {
				featureFlagCallbacks.delete(callback);
			};
		}),
		people: {
			set: mock(() => {}),
			set_once: mock(() => {}),
		},
	};

	return {
		client,
		featureFlags,
		featureFlagPayloads,
		emitFeatureFlags: () => {
			for (const callback of featureFlagCallbacks) {
				callback();
			}
		},
	};
}

describe("renderer PostHog facade", () => {
	test("treats missing and local-disabled keys as no-op", async () => {
		env.NEXT_PUBLIC_POSTHOG_KEY = undefined;

		expect(isPostHogEnabled()).toBe(false);
		expect(await initPostHog("device-id")).toBeNull();
		expect(() => posthog.capture("before_init")).not.toThrow();

		env.NEXT_PUBLIC_POSTHOG_KEY = "phc_local_dev_disabled";

		expect(isPostHogEnabled()).toBe(false);
		expect(await initPostHog("device-id")).toBeNull();
	});

	test("queues lightweight operations until a client is available", () => {
		env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test_key";
		const { client } = createMockClient();

		posthog.capture("panel_opened", { panel: "code" });
		posthog.register({ surface: "v2" });
		posthog.people.set({ role: "tester" });

		expect(client.capture).toHaveBeenCalledTimes(0);

		__setPostHogClientForTests(client);

		expect(client.capture).toHaveBeenCalledWith("panel_opened", {
			panel: "code",
		});
		expect(client.register).toHaveBeenCalledWith({ surface: "v2" });
		expect(client.people?.set).toHaveBeenCalledWith({ role: "tester" });
	});

	test("notifies local feature flag subscribers from the loaded client", () => {
		const { client, emitFeatureFlags, featureFlags, featureFlagPayloads } =
			createMockClient();
		const observed: Array<{
			enabled: boolean | undefined;
			payload: unknown;
		}> = [];

		__setPostHogClientForTests(client);
		const unsubscribe = posthog.onFeatureFlags(() => {
			observed.push({
				enabled: posthog.isFeatureEnabled("cloud-access"),
				payload: posthog.getFeatureFlagPayload("relay-url-override"),
			});
		});

		featureFlags.set("cloud-access", true);
		featureFlagPayloads.set("relay-url-override", {
			url: "https://relay.example.com",
		});
		emitFeatureFlags();

		unsubscribe();
		featureFlags.set("cloud-access", false);
		emitFeatureFlags();

		expect(observed).toEqual([
			{
				enabled: true,
				payload: { url: "https://relay.example.com" },
			},
		]);
	});
});
