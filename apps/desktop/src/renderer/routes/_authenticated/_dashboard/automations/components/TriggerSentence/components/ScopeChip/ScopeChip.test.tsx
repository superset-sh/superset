import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — ScopeChip renders a
// Radix popover and a cmdk list, both of which need a real DOM. Bun runs test
// files sequentially in one process and happy-dom's globals are process-wide,
// so we MUST unregister in afterAll to restore the shared mock document for the
// other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, within } = await import("@testing-library/react");
const { ScopeChip } = await import("./ScopeChip");

type Scope = Parameters<typeof ScopeChip>[0]["scope"];

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const OPTIONS = [
	{ id: "1", label: "alpha" },
	{ id: "2", label: "beta" },
];

/**
 * Renders the chip and opens its popover, which is where everything lives.
 *
 * Queries go through the render's own baseElement rather than the global
 * `screen`: `screen` binds document.body when @testing-library/react is first
 * imported, and another suite unregistering happy-dom leaves that binding
 * pointing at a torn-down document — the module is cached, so re-importing does
 * not rebind it. Everything here would then query an empty body.
 */
async function open(props: Partial<Parameters<typeof ScopeChip>[0]> = {}) {
	const onChange = mock((_next: unknown) => {});
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<ScopeChip
				scope={{ mode: "list", ids: [] } as Scope}
				onChange={onChange}
				options={OPTIONS}
				emptyLabel="Select things"
				anyLabel="Any thing"
				{...props}
			/>,
		);
	});
	const ui = within(view.baseElement as HTMLElement);
	await act(async () => {
		ui.getByRole("button").click();
	});
	return { onChange, ui };
}

describe("ScopeChip empty list", () => {
	// The three faces of an empty list have to be distinguishable; for a long
	// time they all read "Nothing to choose yet", which is how a revoked token
	// looked exactly like an empty workspace.
	test("says it is loading rather than empty", async () => {
		const { ui } = await open({
			options: [],
			state: { isLoading: true, isError: false, refetch: () => {} },
		});
		expect(ui.queryByText("Loading…")).not.toBeNull();
		expect(ui.queryByText("Nothing to choose yet")).toBeNull();
	});

	test("offers a retry when the load failed", async () => {
		const refetch = mock(() => {});
		const { ui } = await open({
			options: [],
			state: { isLoading: false, isError: true, refetch },
		});
		const retry = ui.getByText("Couldn't load — retry");
		await act(async () => {
			retry.click();
		});
		expect(refetch).toHaveBeenCalled();
	});

	test("says nothing to choose when there is genuinely nothing", async () => {
		const { ui } = await open({
			options: [],
			state: { isLoading: false, isError: false, refetch: () => {} },
		});
		expect(ui.queryByText("Nothing to choose yet")).not.toBeNull();
	});

	// Regression: Refresh used to be gated behind options.length > 0, so it
	// disappeared exactly when the list needed reloading.
	test("still offers Refresh with an empty list", async () => {
		const refetch = mock(() => {});
		const { ui } = await open({
			options: [],
			state: { isLoading: false, isError: false, refetch },
		});
		const refresh = ui.getByText(/Refresh/);
		await act(async () => {
			refresh.click();
		});
		expect(refetch).toHaveBeenCalled();
	});

	test("shows no footer at all without option state", async () => {
		const { ui } = await open({ options: [] });
		expect(ui.queryByText(/Refresh/)).toBeNull();
	});
});

describe("ScopeChip selection", () => {
	test("toggles ids on and off when multi-select", async () => {
		const { onChange, ui } = await open({ scope: { mode: "list", ids: [] } });
		await act(async () => {
			ui.getByText("alpha").click();
		});
		expect(onChange).toHaveBeenCalledWith({ mode: "list", ids: ["1"] });
	});

	test("replaces the selection when single", async () => {
		const { onChange, ui } = await open({
			single: true,
			scope: { mode: "list", ids: ["1"] },
		});
		await act(async () => {
			ui.getByText("beta").click();
		});
		// Replaced, not appended — the whole point of single-select.
		expect(onChange).toHaveBeenCalledWith({ mode: "list", ids: ["2"] });
	});

	test("offers Any only when allowed", async () => {
		const allowed = await open({ allowAny: true });
		expect(allowed.ui.queryByText("Any thing")).not.toBeNull();
		cleanup();
		const refused = await open({ allowAny: false });
		expect(refused.ui.queryByText("Any thing")).toBeNull();
	});

	test("offers Me only when allowed", async () => {
		const allowed = await open({ allowMe: true });
		expect(allowed.ui.queryByText("Me")).not.toBeNull();
		cleanup();
		const refused = await open({ allowMe: false });
		expect(refused.ui.queryByText("Me")).toBeNull();
	});
});

describe("ScopeChip rows", () => {
	// The checkbox column already says these are channels; a # on every row is
	// noise. The chip in the sentence still keeps it, where it identifies the
	// thing rather than decorating a list.
	test("drop a leading # that belongs to the sentence, not the list", async () => {
		const { ui } = await open({
			options: [{ id: "C1", label: "#general" }],
		});
		expect(ui.getByText("general")).toBeDefined();
		expect(ui.queryByText("#general")).toBeNull();
	});

	test("show the group heading even for a single row", async () => {
		const { ui } = await open({
			options: [{ id: "C1", label: "#general" }],
			countNoun: { singular: "channel", plural: "channels" },
		});
		expect(ui.getByText("Channels")).toBeDefined();
	});

	// Searching an owner org or a pasted id has to find the row rather than
	// offering to add it a second time.
	test("match on the hint as well as the label", async () => {
		const { ui } = await open({
			options: [{ id: "10", label: "superset", hint: "superset-sh" }],
			allowCustom: { placeholder: "Search..." },
		});
		expect(ui.getByText("superset-sh")).toBeDefined();
	});
});
