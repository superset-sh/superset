import { env } from "../env.renderer";

type PostHogProperties = Record<string, unknown>;
type QueuedOperation = (client: LoadedPostHogClient) => void;
type Unsubscribe = () => void;

export interface LoadedPostHogClient {
	init: (apiKey: string, options: PostHogProperties) => void;
	capture: (event: string, properties?: PostHogProperties) => void;
	identify: (distinctId: string, properties?: PostHogProperties) => void;
	reset: () => void;
	register: (properties: PostHogProperties) => void;
	reloadFeatureFlags: () => void;
	opt_in_capturing: () => void;
	opt_out_capturing: () => void;
	isFeatureEnabled: (flag: string) => boolean | undefined;
	getFeatureFlagPayload: (flag: string) => unknown;
	onFeatureFlags: (callback: () => void) => Unsubscribe;
	people?: {
		set?: (properties: PostHogProperties) => void;
		set_once?: (properties: PostHogProperties) => void;
	};
}

interface PostHogModule {
	default?: LoadedPostHogClient;
	posthog?: LoadedPostHogClient;
}

interface PostHogFacade {
	capture: (event: string, properties?: PostHogProperties) => void;
	identify: (distinctId: string, properties?: PostHogProperties) => void;
	reset: () => void;
	register: (properties: PostHogProperties) => void;
	reloadFeatureFlags: () => void;
	opt_in_capturing: () => void;
	opt_out_capturing: () => void;
	isFeatureEnabled: (flag: string) => boolean | undefined;
	getFeatureFlagPayload: (flag: string) => unknown;
	onFeatureFlags: (callback: () => void) => Unsubscribe;
	people: {
		set: (properties: PostHogProperties) => void;
		set_once: (properties: PostHogProperties) => void;
	};
}

const DISABLED_POSTHOG_KEYS = new Set([
	"",
	"disabled",
	"false",
	"phc_local_dev_disabled",
]);
const MAX_QUEUED_OPERATIONS = 100;

let loadedClient: LoadedPostHogClient | null = null;
let initPromise: Promise<LoadedPostHogClient | null> | null = null;
let featureFlagUnsubscribe: Unsubscribe | null = null;
const queuedOperations: QueuedOperation[] = [];
const featureFlagListeners = new Set<() => void>();

export function isPostHogEnabled(): boolean {
	const key = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
	return !!key && !DISABLED_POSTHOG_KEYS.has(key.toLowerCase());
}

export function getPostHogClient(): LoadedPostHogClient | null {
	return loadedClient;
}

function getPlatform(): string {
	if (typeof window === "undefined") return "unknown";
	return window.navigator.platform;
}

function runOperation(operation: QueuedOperation): void {
	if (!loadedClient) return;

	try {
		operation(loadedClient);
	} catch (error) {
		console.warn("[posthog] Operation failed:", error);
	}
}

function enqueueOperation(operation: QueuedOperation): void {
	if (!isPostHogEnabled()) return;

	if (loadedClient) {
		runOperation(operation);
		return;
	}

	if (queuedOperations.length >= MAX_QUEUED_OPERATIONS) {
		queuedOperations.shift();
	}
	queuedOperations.push(operation);
}

function flushQueuedOperations(): void {
	if (!loadedClient) return;

	const operations = queuedOperations.splice(0);
	for (const operation of operations) {
		runOperation(operation);
	}
}

function notifyFeatureFlagListeners(): void {
	for (const listener of featureFlagListeners) {
		listener();
	}
}

function subscribeToLoadedClientFeatureFlags(
	client: LoadedPostHogClient,
): void {
	featureFlagUnsubscribe?.();
	featureFlagUnsubscribe = null;

	try {
		featureFlagUnsubscribe = client.onFeatureFlags(() => {
			notifyFeatureFlagListeners();
		});
	} catch (error) {
		console.warn("[posthog] Feature flag subscription failed:", error);
	}
}

async function loadPostHogClient(): Promise<LoadedPostHogClient> {
	const module = (await import(
		"posthog-js/dist/module.no-external"
	)) as PostHogModule;
	const client = module.default ?? module.posthog;

	if (!client) {
		throw new Error("PostHog module did not expose a client");
	}

	return client;
}

export async function initPostHog(
	deviceId?: string,
): Promise<LoadedPostHogClient | null> {
	if (!isPostHogEnabled()) {
		queuedOperations.length = 0;
		notifyFeatureFlagListeners();
		return null;
	}

	if (loadedClient) return loadedClient;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
		if (!apiKey) return null;

		const client = await loadPostHogClient();
		client.init(apiKey, {
			api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
			defaults: "2025-11-30",
			capture_pageview: false,
			capture_pageleave: false,
			capture_exceptions: true,
			person_profiles: "identified_only",
			persistence: "localStorage",
			debug: false,
			...(deviceId && {
				bootstrap: { distinctID: deviceId, isIdentifiedID: false },
			}),
			loaded: (ph: LoadedPostHogClient) => {
				ph.register({
					app_name: "desktop",
					platform: getPlatform(),
					...(deviceId && { device_id: deviceId }),
				});
			},
		});

		loadedClient = client;
		subscribeToLoadedClientFeatureFlags(client);
		flushQueuedOperations();
		notifyFeatureFlagListeners();

		return client;
	})().catch((error) => {
		initPromise = null;
		throw error;
	});

	return initPromise;
}

function assertTestEnvironment(): void {
	if (env.NODE_ENV !== "test") {
		throw new Error("PostHog test helpers are only available in tests");
	}
}

export function __resetPostHogForTests(): void {
	assertTestEnvironment();
	featureFlagUnsubscribe?.();
	featureFlagUnsubscribe = null;
	loadedClient = null;
	initPromise = null;
	queuedOperations.length = 0;
	featureFlagListeners.clear();
}

export function __setPostHogClientForTests(client: LoadedPostHogClient): void {
	assertTestEnvironment();
	loadedClient = client;
	subscribeToLoadedClientFeatureFlags(client);
	flushQueuedOperations();
	notifyFeatureFlagListeners();
}

export const posthog: PostHogFacade = {
	capture(event, properties) {
		enqueueOperation((client) => client.capture(event, properties));
	},
	identify(distinctId, properties) {
		enqueueOperation((client) => client.identify(distinctId, properties));
	},
	reset() {
		queuedOperations.length = 0;
		if (loadedClient) {
			runOperation((client) => client.reset());
		}
		notifyFeatureFlagListeners();
	},
	register(properties) {
		enqueueOperation((client) => client.register(properties));
	},
	reloadFeatureFlags() {
		enqueueOperation((client) => client.reloadFeatureFlags());
	},
	opt_in_capturing() {
		enqueueOperation((client) => client.opt_in_capturing());
	},
	opt_out_capturing() {
		enqueueOperation((client) => client.opt_out_capturing());
	},
	isFeatureEnabled(flag) {
		return loadedClient?.isFeatureEnabled(flag);
	},
	getFeatureFlagPayload(flag) {
		return loadedClient?.getFeatureFlagPayload(flag);
	},
	onFeatureFlags(callback) {
		featureFlagListeners.add(callback);
		return () => {
			featureFlagListeners.delete(callback);
		};
	},
	people: {
		set(properties) {
			enqueueOperation((client) => client.people?.set?.(properties));
		},
		set_once(properties) {
			enqueueOperation((client) => client.people?.set_once?.(properties));
		},
	},
};
