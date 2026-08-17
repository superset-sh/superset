import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — the dialog renders
// through Radix portals, which need a real DOM. Bun runs test files
// sequentially in one process and happy-dom's globals are process-wide, so
// we MUST unregister in afterAll (below) to restore the shared mock document
// for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Query via render()'s returned helpers, never RTL's `screen`: `screen` binds
// to whichever document.body existed when @testing-library/dom was FIRST
// imported in the process, so in a full-suite run it can point at a previous
// suite's torn-down happy-dom window and find nothing.
const { act, cleanup, render } = await import("@testing-library/react");
const { GitInitConfirmDialog } = await import("./GitInitConfirmDialog");
const { useGitInitConfirmStore } = await import(
	"renderer/stores/git-init-confirm"
);

afterEach(() => {
	cleanup();
	// A pending request left behind by one test would make the next one flaky.
	act(() => useGitInitConfirmStore.getState().resolve(false));
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("GitInitConfirmDialog", () => {
	// Regression: the import flow awaits request() forever if no dialog
	// instance is mounted to resolve it — the caller's busy state then locks
	// the whole screen. This suite drives the store exactly like
	// useFolderFirstImport does and asserts the mounted dialog settles it.
	test("request() opens the dialog and confirming resolves true", async () => {
		const { getByText, queryByText } = render(<GitInitConfirmDialog />);

		let confirmed: Promise<boolean> = Promise.resolve(false);
		act(() => {
			confirmed = useGitInitConfirmStore.getState().request("/repos/my-app");
		});

		expect(getByText("Initialize git repository?")).toBeTruthy();
		expect(getByText("my-app")).toBeTruthy();

		act(() => {
			getByText("Initialize & import").click();
		});

		expect(await confirmed).toBe(true);
		expect(queryByText("Initialize git repository?")).toBeNull();
	});

	test("cancelling resolves false", async () => {
		const { getByText } = render(<GitInitConfirmDialog />);

		let confirmed: Promise<boolean> = Promise.resolve(true);
		act(() => {
			confirmed = useGitInitConfirmStore.getState().request("/repos/my-app");
		});

		act(() => {
			getByText("Cancel").click();
		});

		expect(await confirmed).toBe(false);
	});
});
