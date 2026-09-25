import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, within } = await import("@testing-library/react");
const { RuntimeWarnings } = await import("./RuntimeWarnings");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * How a standing warning presents, below the rows and the scope line:
 *
 *   ⚠ This trigger will not run for messages in #access-requests
 *     until @Superset is invited.
 *
 * Amber rather than destructive, and no banner: the config is valid and saves
 * fine. These describe the world, not an unfinished edit, so they must not
 * read as an error the editor is refusing over.
 */
async function warnings(list: string[]) {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(<RuntimeWarnings warnings={list} />);
	});
	return {
		ui: within(view.baseElement as HTMLElement),
		container: view.container,
	};
}

describe("standing warnings", () => {
	test("say what will not run, and what to do about it", async () => {
		const text =
			"This trigger will not run for messages in #access-requests until @Superset is invited.";
		const { ui } = await warnings([text]);
		expect(ui.getByText(text)).toBeDefined();
	});

	test("show one line per warning", async () => {
		const { container } = await warnings(["first warning", "second warning"]);
		expect(container.querySelectorAll("p")).toHaveLength(2);
	});

	// Deduplication is not done here — two rows watching the same channel earn
	// the same sentence, and TriggersEditor collapses them through a Set before
	// this ever sees them. Asserting it here would only restate its input.

	test("carry the warning icon", async () => {
		const { container } = await warnings(["a warning"]);
		expect(container.querySelector("svg")).not.toBeNull();
	});

	// Amber, not destructive: nothing is being refused.
	test("read as a caution rather than an error", async () => {
		const { container } = await warnings(["a warning"]);
		const line = container.querySelector("p");
		expect(line?.className).toContain("amber");
		expect(line?.className).not.toContain("destructive");
	});

	// The renderer body sets user-select: none, and a warning naming a channel
	// is something people copy out.
	test("can be selected and copied", async () => {
		const { container } = await warnings(["a warning"]);
		expect(container.querySelector("p")?.className).toContain("select-text");
	});

	test("take up no space when there are none", async () => {
		const { container } = await warnings([]);
		expect(container.innerHTML).toBe("");
	});
});
