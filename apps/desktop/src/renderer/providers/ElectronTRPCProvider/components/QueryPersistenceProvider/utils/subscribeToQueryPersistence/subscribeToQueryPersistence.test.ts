import {
	afterAll,
	afterEach,
	beforeEach,
	expect,
	jest,
	mock,
	spyOn,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { subscribeToQueryPersistence } from "./subscribeToQueryPersistence";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

let client: QueryClient;
let stop: (() => void) | undefined;
let saved: PersistedClient[];

beforeEach(() => {
	jest.useFakeTimers();
	client = new QueryClient({
		defaultOptions: { queries: { gcTime: Infinity } },
	});
	saved = [];
});

afterEach(async () => {
	stop?.();
	stop = undefined;
	await settleSave();
	client.clear();
	jest.useRealTimers();
	mock.restore();
});

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

async function settleSave() {
	for (let index = 0; index < 6; index++) await Promise.resolve();
}

function subscribe(
	persistClient: (value: PersistedClient) => void | Promise<void> = (value) => {
		saved.push(value);
	},
) {
	const shouldDehydrateQuery = mock(() => true);
	stop = subscribeToQueryPersistence({
		queryClient: client,
		buster: "v2",
		persister: {
			persistClient: (value) => {
				return Promise.resolve(persistClient(value)).then(() => undefined);
			},
			restoreClient: () => undefined,
			removeClient: () => {},
		},
		dehydrateOptions: { shouldDehydrateQuery },
	});
	return shouldDehydrateQuery;
}

test("a burst of query updates dehydrates once with the latest data", async () => {
	const inspectQuery = subscribe();
	for (let value = 0; value < 10; value++) {
		client.setQueryData(["dashboard-sidebar", "workspace"], value);
	}
	expect(inspectQuery).not.toHaveBeenCalled();
	expect(saved).toHaveLength(0);
	jest.advanceTimersByTime(30_000);
	await settleSave();
	expect(inspectQuery).toHaveBeenCalledTimes(1);
	expect(saved).toHaveLength(1);
	expect(saved[0]?.clientState.queries[0]?.state.data).toBe(9);
	expect(saved[0]?.buster).toBe("v2");
});

test("continuous activity cannot postpone saving past the interval", async () => {
	subscribe();
	client.setQueryData(["workspace"], 1);
	jest.advanceTimersByTime(20_000);
	client.setQueryData(["workspace"], 2);
	jest.advanceTimersByTime(10_000);
	await settleSave();
	expect(saved).toHaveLength(1);
	expect(saved[0]?.clientState.queries[0]?.state.data).toBe(2);
	jest.advanceTimersByTime(60_000);
	expect(saved).toHaveLength(1);
});

test("query removal is reflected in the next saved snapshot", async () => {
	subscribe();
	client.setQueryData(["workspace"], 1);
	jest.advanceTimersByTime(30_000);
	await settleSave();
	client.removeQueries({ queryKey: ["workspace"] });
	jest.advanceTimersByTime(30_000);
	await settleSave();
	expect(saved).toHaveLength(2);
	expect(saved[1]?.clientState.queries).toEqual([]);
});

test.each([
	"blur",
	"pagehide",
])("%s flushes dirty data without waiting", async (event) => {
	subscribe();
	client.setQueryData(["workspace"], 1);
	window.dispatchEvent(new Event(event));
	await settleSave();
	expect(saved).toHaveLength(1);
	jest.advanceTimersByTime(30_000);
	expect(saved).toHaveLength(1);
});

test("only a hidden visibility change flushes dirty data", async () => {
	subscribe();
	const descriptor = Object.getOwnPropertyDescriptor(
		document,
		"visibilityState",
	);
	let visibility = "visible";
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => visibility,
	});
	try {
		client.setQueryData(["workspace"], 1);
		document.dispatchEvent(new Event("visibilitychange"));
		expect(saved).toHaveLength(0);
		visibility = "hidden";
		document.dispatchEvent(new Event("visibilitychange"));
		await settleSave();
		expect(saved).toHaveLength(1);
	} finally {
		if (descriptor)
			Object.defineProperty(document, "visibilityState", descriptor);
		else Reflect.deleteProperty(document, "visibilityState");
	}
});

test("a leave flush waits for the current write before saving newer data", async () => {
	const firstWrite = Promise.withResolvers<void>();
	const writes: PersistedClient[] = [];
	subscribe((value) => {
		writes.push(value);
		return writes.length === 1 ? firstWrite.promise : Promise.resolve();
	});
	client.setQueryData(["workspace"], 1);
	window.dispatchEvent(new Event("blur"));
	client.setQueryData(["workspace"], 2);
	window.dispatchEvent(new Event("pagehide"));
	expect(writes).toHaveLength(1);
	firstWrite.resolve();
	await settleSave();
	expect(writes).toHaveLength(2);
	expect(writes[1]?.clientState.queries[0]?.state.data).toBe(2);
});

test("cleanup flushes once and removes cache and lifecycle subscriptions", async () => {
	subscribe();
	client.setQueryData(["workspace"], 1);
	stop?.();
	stop = undefined;
	await settleSave();
	client.setQueryData(["workspace"], 2);
	window.dispatchEvent(new Event("blur"));
	jest.advanceTimersByTime(60_000);
	expect(saved).toHaveLength(1);
	expect(saved[0]?.clientState.queries[0]?.state.data).toBe(1);
});

test("a failed save does not prevent the next cache update from being saved", async () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	let attempts = 0;
	subscribe((value) => {
		if (++attempts === 1)
			return Promise.reject(new Error("storage unavailable"));
		saved.push(value);
		return Promise.resolve();
	});
	client.setQueryData(["workspace"], 1);
	jest.advanceTimersByTime(30_000);
	await settleSave();
	client.setQueryData(["workspace"], 2);
	jest.advanceTimersByTime(30_000);
	await settleSave();
	expect(warn).toHaveBeenCalledTimes(1);
	expect(saved).toHaveLength(1);
	expect(saved[0]?.clientState.queries[0]?.state.data).toBe(2);
});

test.each([
	"interval",
	"blur",
	"pagehide",
	"cleanup",
])("%s retries a failed save without a cache update", async (trigger) => {
	spyOn(console, "warn").mockImplementation(() => {});
	let attempts = 0;
	subscribe((value) => {
		if (++attempts === 1)
			return Promise.reject(new Error("storage unavailable"));
		saved.push(value);
	});
	client.setQueryData(["workspace"], 1);
	jest.advanceTimersByTime(30_000);
	await settleSave();
	if (trigger === "interval") jest.advanceTimersByTime(30_000);
	else if (trigger === "cleanup") {
		stop?.();
		stop = undefined;
	} else window.dispatchEvent(new Event(trigger));
	await settleSave();
	expect(saved).toHaveLength(1);
	expect(saved[0]?.clientState.queries[0]?.state.data).toBe(1);
});

test("failed cleanup does not leave a retry timer running", async () => {
	spyOn(console, "warn").mockImplementation(() => {});
	const persist = mock(async () => {
		throw new Error("storage unavailable");
	});
	subscribe(persist);
	client.setQueryData(["workspace"], 1);
	stop?.();
	stop = undefined;
	await settleSave();
	jest.advanceTimersByTime(60_000);
	await settleSave();
	expect(persist).toHaveBeenCalledTimes(1);
});
