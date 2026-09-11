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
	test("does not revert to the OS locale when the persisted-language query errors (#7415)", async () => {
		// Simulate a CMD+R reload: the OS is Japanese, but the getLanguage IPC
		// query has settled into an error (e.g. a transport race right after
		// the preload script re-establishes the electron-trpc channel).
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

		expect(document.documentElement.lang).not.toBe("ja");
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
