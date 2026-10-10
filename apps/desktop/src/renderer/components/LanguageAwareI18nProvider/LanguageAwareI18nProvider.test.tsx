import { afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { DEFAULT_LOCALE, initI18nAsync } = await import("@superset/i18n");
const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { observable } = await import("@trpc/server/observable");
const { cleanup, render, waitFor } = await import("@testing-library/react");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { LanguageAwareI18nProvider } = await import(
	"./LanguageAwareI18nProvider"
);

const originalLanguages = Object.getOwnPropertyDescriptor(
	navigator,
	"languages",
);

function setNavigatorLanguages(languages: string[]) {
	Object.defineProperty(navigator, "languages", {
		value: languages,
		configurable: true,
	});
}

const NEVER = Symbol("never answers");

function renderProvider(readLanguage: (attempt: number) => unknown) {
	let attempts = 0;
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			if (call.op.path !== "settings.getLanguage") return;
			attempts += 1;
			try {
				const language = readLanguage(attempts);
				if (language === NEVER) return;
				observer.next({ result: { data: language } });
				observer.complete();
			} catch (error) {
				observer.error(TRPCClientError.from(error as Error));
			}
		});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<LanguageAwareI18nProvider languageRetryDelayMs={1}>
				<div data-testid="marker" />
			</LanguageAwareI18nProvider>
		</electronTrpc.Provider>,
	);
	return { view, attempts: () => attempts };
}

function failRead(): never {
	throw new Error("IPC channel not ready");
}

afterEach(async () => {
	cleanup();
	if (originalLanguages) {
		Object.defineProperty(navigator, "languages", originalLanguages);
	} else {
		Reflect.deleteProperty(navigator, "languages");
	}
	await initI18nAsync(DEFAULT_LOCALE);
	document.documentElement.lang = "";
});
describe("LanguageAwareI18nProvider", () => {
	test("retries a failed first read instead of settling on no preference (#7415)", async () => {
		setNavigatorLanguages(["ja-JP"]);
		const { view, attempts } = renderProvider((attempt) =>
			attempt === 1 ? failRead() : "en",
		);

		await view.findByTestId("marker");
		expect(attempts()).toBe(2);
		expect(document.documentElement.lang).toBe("en");
	});

	test("stays deferred while the read is pending, even after a failed attempt", async () => {
		setNavigatorLanguages(["ja-JP"]);
		const { view, attempts } = renderProvider((attempt) =>
			attempt === 1 ? failRead() : NEVER,
		);

		await waitFor(() => expect(attempts()).toBe(2));
		expect(view.queryByTestId("marker")).toBeNull();
		expect(document.documentElement.lang).not.toBe("ja");
	});

	test("falls back to the inferred locale once retries are exhausted, instead of staying blank forever", async () => {
		setNavigatorLanguages(["ja-JP"]);
		const { view, attempts } = renderProvider(failRead);

		await view.findByTestId("marker");
		expect(attempts()).toBe(4);
		expect(document.documentElement.lang).toBe("ja");
	});

	test("activates the persisted locale once the read succeeds", async () => {
		setNavigatorLanguages(["ja-JP"]);
		const { view } = renderProvider(() => "en");

		await view.findByTestId("marker");
		expect(document.documentElement.lang).toBe("en");
	});

	test("infers the OS locale only once the read resolves to no preference", async () => {
		setNavigatorLanguages(["ja-JP"]);
		const { view } = renderProvider(() => null);

		await view.findByTestId("marker");
		expect(document.documentElement.lang).toBe("ja");
	});
});
