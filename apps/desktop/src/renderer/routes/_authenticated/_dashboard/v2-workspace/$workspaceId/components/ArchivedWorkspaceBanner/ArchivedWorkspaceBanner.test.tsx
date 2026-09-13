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

// happy-dom over the preloaded plain-object document. Globals are
// process-wide, so unregister in afterAll (see DestroyConfirmPane.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let unshelveResult: () => Promise<{ shelvedAt: number | null }> = async () => ({
	shelvedAt: null,
});
const unshelve = mock(() => unshelveResult());
const toastError = mock((_message: string) => {});
const toastSuccess = mock((_message: string) => {});

const fakeShelveWorkspace = () => ({
	shelve: async () => ({ shelvedAt: null }),
	unshelve,
});
mock.module("renderer/hooks/host-service/useShelveWorkspace", () => ({
	useShelveWorkspace: fakeShelveWorkspace,
	// Both exports, so this process-global mock never strips a symbol another
	// test file imports.
	useShelveWorkspaceWithTarget: fakeShelveWorkspace,
}));
mock.module("@superset/ui/sonner", () => ({
	toast: { error: toastError, success: toastSuccess },
}));

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { ArchivedWorkspaceBanner } = await import("./ArchivedWorkspaceBanner");

const DAY_MS = 24 * 60 * 60 * 1000;
const page = () => within(document.body);

beforeEach(() => {
	unshelveResult = async () => ({ shelvedAt: null });
	unshelve.mockClear();
	toastError.mockClear();
	toastSuccess.mockClear();
});
afterEach(() => cleanup());
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("ArchivedWorkspaceBanner", () => {
	test("says the workspace is archived and when it goes away", () => {
		render(
			<ArchivedWorkspaceBanner
				workspaceId="ws-1"
				workspaceName="fix login"
				deleteAt={Date.now() + 3 * DAY_MS + 60_000}
				isPaused={false}
				pauseReason={null}
			/>,
		);

		expect(
			page().getByText(/This workspace is archived · deletes in 3 days/),
		).toBeTruthy();
	});

	test("explains a paused deletion instead of counting down", () => {
		render(
			<ArchivedWorkspaceBanner
				workspaceId="ws-1"
				workspaceName="fix login"
				deleteAt={Date.now() - 3 * DAY_MS}
				isPaused
				pauseReason="dirty"
			/>,
		);

		expect(
			page().getByText(
				"This workspace is archived · deletion paused: uncommitted changes",
			),
		).toBeTruthy();
	});

	test("a pause the host could not verify is described as such", () => {
		render(
			<ArchivedWorkspaceBanner
				workspaceId="ws-1"
				workspaceName="fix login"
				deleteAt={Date.now() - 3 * DAY_MS}
				isPaused
				pauseReason="unverifiable"
			/>,
		);

		expect(
			page().getByText(
				"This workspace is archived · deletion paused: couldn't verify the worktree",
			),
		).toBeTruthy();
	});

	test("Restore unshelves the workspace", async () => {
		render(
			<ArchivedWorkspaceBanner
				workspaceId="ws-1"
				workspaceName="fix login"
				deleteAt={Date.now() + DAY_MS}
				isPaused={false}
				pauseReason={null}
			/>,
		);

		await act(async () => {
			fireEvent.click(page().getByRole("button", { name: "Restore" }));
		});

		expect(unshelve).toHaveBeenCalledTimes(1);
		expect(toastError).not.toHaveBeenCalled();
	});

	test.each([
		"removed button",
		"another target",
		"blurred target",
	])("pending restore preserves focus ownership: %s", async (scenario) => {
		let resolveRestore!: (value: { shelvedAt: null }) => void;
		unshelveResult = () =>
			new Promise((resolve) => {
				resolveRestore = resolve;
			});
		const onRestored = mock(() => {});
		const banner = render(
			<ArchivedWorkspaceBanner
				workspaceId="ws-1"
				workspaceName="fix login"
				deleteAt={Date.now() + DAY_MS}
				isPaused={false}
				pauseReason={null}
				onRestored={onRestored}
			/>,
		);
		render(<button type="button">Terminal</button>);
		const button = page().getByRole("button", { name: "Restore" });
		button.focus();
		fireEvent.click(button);
		if (scenario !== "removed button") {
			const terminal = page().getByRole("button", { name: "Terminal" });
			terminal.focus();
			if (scenario === "blurred target") terminal.blur();
		}
		banner.unmount();
		await act(async () => {
			resolveRestore({ shelvedAt: null });
		});
		expect(onRestored).toHaveBeenCalledTimes(
			scenario === "removed button" ? 1 : 0,
		);
	});

	test("a failed restore is reported, not swallowed", async () => {
		unshelveResult = async () => {
			throw new Error("workspace host unavailable: offline");
		};
		render(
			<ArchivedWorkspaceBanner
				workspaceId="ws-1"
				workspaceName="fix login"
				deleteAt={Date.now() + DAY_MS}
				isPaused={false}
				pauseReason={null}
			/>,
		);

		await act(async () => {
			fireEvent.click(page().getByRole("button", { name: "Restore" }));
		});

		expect(toastError).toHaveBeenCalledTimes(1);
	});
});
