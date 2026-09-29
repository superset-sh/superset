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

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const originalElectronTrpc = (await import("renderer/lib/electron-trpc"))
	.electronTrpc;
const originalSonner = { ...(await import("@superset/ui/sonner")) };

const openUrl = mock((_url: string): Promise<void> => Promise.resolve());
const showError = mock((_message: string) => {});
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		external: { openUrl: { useMutation: () => ({ mutateAsync: openUrl }) } },
	},
}));
mock.module("@superset/ui/sonner", () => ({ toast: { error: showError } }));

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { OpenAllPullRequestsButton } = await import(
	"./OpenAllPullRequestsButton"
);
const urls = [
	"https://github.com/acme/one/pull/12",
	"https://github.com/acme/two/pull/13",
];

beforeEach(() => {
	openUrl.mockReset();
	openUrl.mockImplementation(() => Promise.resolve());
	showError.mockClear();
});
afterEach(cleanup);
afterAll(async () => {
	mock.module("renderer/lib/electron-trpc", () => ({
		electronTrpc: originalElectronTrpc,
	}));
	mock.module("@superset/ui/sonner", () => originalSonner);
	mock.restore();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("OpenAllPullRequestsButton", () => {
	test("is disabled when no workspace has an active PR", () => {
		render(<OpenAllPullRequestsButton urls={[]} />);
		const button = within(document.body).getByRole("button", {
			name: "Open all PRs in browser",
		}) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
		expect(openUrl).not.toHaveBeenCalled();
	});

	test("opens every URL externally and prevents a second click while opening", async () => {
		let finishOpening = () => {};
		const pending = new Promise<void>((resolve) => {
			finishOpening = resolve;
		});
		openUrl.mockImplementation(() => pending);
		render(<OpenAllPullRequestsButton urls={urls} />);
		const button = within(document.body).getByRole("button", {
			name: "Open all PRs in browser",
		}) as HTMLButtonElement;
		await act(async () => {
			fireEvent.click(button);
		});
		expect(openUrl.mock.calls.map(([url]) => url)).toEqual(urls);
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
		expect(openUrl).toHaveBeenCalledTimes(2);
		await act(async () => {
			finishOpening();
		});
		expect(button.disabled).toBe(false);
	});

	test("a failed browser launch does not skip other URLs and allows retry", async () => {
		openUrl.mockImplementation((url) =>
			url === urls[0]
				? Promise.reject(new Error("Browser unavailable"))
				: Promise.resolve(),
		);
		render(<OpenAllPullRequestsButton urls={urls} />);
		const button = within(document.body).getByRole("button", {
			name: "Open all PRs in browser",
		}) as HTMLButtonElement;
		await act(async () => {
			fireEvent.click(button);
		});
		expect(openUrl.mock.calls.map(([url]) => url)).toEqual(urls);
		expect(showError).toHaveBeenCalledWith("Browser unavailable");
		expect(button.disabled).toBe(false);
	});
});
