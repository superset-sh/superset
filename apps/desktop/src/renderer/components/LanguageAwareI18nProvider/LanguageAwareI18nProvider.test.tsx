import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom is process-wide; unregister in afterAll so the shared mock
// document is restored for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let languageQueryResult: {
	data?: string | null;
	isPending: boolean;
	isError: boolean;
} = { data: undefined, isPending: true, isError: false };
const getLanguageUseQuery = mock(
	(_input: unknown, _options?: unknown) => languageQueryResult,
);
const setLanguageData = mock();

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		settings: {
			getLanguage: { useQuery: getLanguageUseQuery },
			onLanguageChange: { useSubscription: mock() },
		},
		useUtils: () => ({
			settings: { getLanguage: { setData: setLanguageData } },
		}),
	},
}));

// The tagger renders alongside the provider's children and pulls in auth and
// PostHog — irrelevant to locale resolution, stubbed out here.
mock.module("renderer/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));
mock.module("renderer/lib/posthog", () => ({
	posthog: { register: mock(), people: { set: mock() } },
}));

const originalNavigator = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);
function setNavigatorLanguages(languages: string[]) {
	Object.defineProperty(globalThis, "navigator", {
		value: { ...globalThis.navigator, languages },
		configurable: true,
		writable: true,
	});
}

const { act, cleanup, render } = await import("@testing-library/react");
const { LanguageAwareI18nProvider } = await import(
	"./LanguageAwareI18nProvider"
);

async function flush() {
	// Lets the locale-activation effect's dynamic catalog import and its
	// .finally(() => setReady(true)) settle across a couple of microtask/
	// macrotask turns.
	for (let i = 0; i < 5; i++) {
		// eslint-disable-next-line no-await-in-loop
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	}
}

beforeEach(() => {
	getLanguageUseQuery.mockClear();
	setLanguageData.mockClear();
	languageQueryResult = { data: undefined, isPending: true, isError: false };
});
afterEach(() => {
	cleanup();
	if (originalNavigator) {
		Object.defineProperty(globalThis, "navigator", originalNavigator);
	}
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("LanguageAwareI18nProvider", () => {
	test("configures getLanguage to retry instead of failing on the first attempt (#7415)", async () => {
		// A CMD+R reload re-establishes the electron-trpc IPC channel in a
		// fresh JS realm, making the very first getLanguage fetch after a
		// reload the one most likely to race it transiently. Retrying keeps
		// React Query's `isPending` true across that race so it self-heals
		// before ever reaching the isPending:false branches below, instead of
		// settling into "no preference" on a single flaky attempt.
		await act(async () => {
			render(
				<LanguageAwareI18nProvider>
					<div data-testid="marker" />
				</LanguageAwareI18nProvider>,
			);
		});

		const options = getLanguageUseQuery.mock.calls.at(-1)?.[1] as {
			retry: number;
			retryDelay: (attempt: number) => number;
		};
		expect(options.retry).toBeGreaterThan(0);
		expect(options.retryDelay(0)).toBeGreaterThan(0);
	});

	test("stays deferred while the query is pending, even after a prior failed attempt", async () => {
		// Mid-retry: React Query reports isPending: true throughout, no
		// matter how many attempts have already failed.
		setNavigatorLanguages(["ja-JP"]);
		languageQueryResult = { data: undefined, isPending: true, isError: true };

		await act(async () => {
			render(
				<LanguageAwareI18nProvider>
					<div data-testid="marker" />
				</LanguageAwareI18nProvider>,
			);
		});
		await flush();

		expect(document.documentElement.lang).not.toBe("ja");
	});

	test("falls back to the inferred locale once retries are exhausted, instead of staying blank forever", async () => {
		// The retry budget configured above is what makes this branch rare in
		// practice — a transient reload-time race self-heals before ever
		// reaching it. Only a genuinely stuck IPC channel settles here, and a
		// stuck channel would break the rest of the app too, so falling back
		// to the inferred locale beats leaving the window blank forever.
		setNavigatorLanguages(["ja-JP"]);
		languageQueryResult = { data: undefined, isPending: false, isError: true };

		await act(async () => {
			render(
				<LanguageAwareI18nProvider>
					<div data-testid="marker" />
				</LanguageAwareI18nProvider>,
			);
		});
		await flush();

		expect(document.documentElement.lang).toBe("ja");
	});

	test("activates the persisted locale once the query succeeds", async () => {
		setNavigatorLanguages(["ja-JP"]);
		languageQueryResult = { data: "en", isPending: false, isError: false };

		await act(async () => {
			render(
				<LanguageAwareI18nProvider>
					<div data-testid="marker" />
				</LanguageAwareI18nProvider>,
			);
		});
		await flush();

		expect(document.documentElement.lang).toBe("en");
	});

	test("infers the OS locale only once the query genuinely resolves to no preference", async () => {
		setNavigatorLanguages(["ja-JP"]);
		languageQueryResult = { data: null, isPending: false, isError: false };

		await act(async () => {
			render(
				<LanguageAwareI18nProvider>
					<div data-testid="marker" />
				</LanguageAwareI18nProvider>,
			);
		});
		await flush();

		expect(document.documentElement.lang).toBe("ja");
	});
});
