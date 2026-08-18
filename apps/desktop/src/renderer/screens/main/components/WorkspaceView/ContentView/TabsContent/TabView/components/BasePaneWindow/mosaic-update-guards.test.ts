import { describe, expect, it, mock } from "bun:test";
import type { MosaicNode, MosaicRootActions } from "react-mosaic-component";
import { createHideUpdate, updateTree } from "react-mosaic-component";
import { guardMosaicActions } from "./mosaic-update-guards";

const LEAF_ROOT: MosaicNode<string> = "pane-1784897806279-1ke7qdxay";
const SPLIT_ROOT: MosaicNode<string> = {
	direction: "row",
	first: "pane-a",
	second: "pane-b",
	splitPercentage: 50,
};

function createActions(root: MosaicNode<string> | null) {
	const actions = {
		expand: mock(),
		remove: mock(),
		hide: mock(),
		replaceWith: mock(),
		updateTree: mock(),
		getRoot: () => root,
	} satisfies MosaicRootActions<string>;
	return { actions, guarded: guardMosaicActions(actions) };
}

describe("guardMosaicActions", () => {
	it("skips hide when the root is a single leaf", () => {
		expect(() => updateTree(LEAF_ROOT, [createHideUpdate([])])).toThrow();

		const { actions, guarded } = createActions(LEAF_ROOT);
		guarded.hide([]);

		expect(actions.hide).not.toHaveBeenCalled();
	});

	it("forwards hide when the path resolves to a branch", () => {
		const { actions, guarded } = createActions(SPLIT_ROOT);
		guarded.hide(["first"]);

		expect(actions.hide).toHaveBeenCalledWith(["first"]);
	});

	it("skips a splitPercentage update addressed to a leaf", () => {
		const leafRoot = createActions(LEAF_ROOT);
		leafRoot.guarded.updateTree([
			{ path: [], spec: { splitPercentage: { $set: undefined } } },
		]);

		const splitRoot = createActions(SPLIT_ROOT);
		splitRoot.guarded.updateTree([
			{ path: ["first"], spec: { splitPercentage: { $set: undefined } } },
		]);

		expect(leafRoot.actions.updateTree).not.toHaveBeenCalled();
		expect(splitRoot.actions.updateTree).not.toHaveBeenCalled();
	});

	it("forwards a splitPercentage update addressed to a branch", () => {
		const updates = [
			{ path: [], spec: { splitPercentage: { $set: undefined } } },
		];
		const { actions, guarded } = createActions(SPLIT_ROOT);
		guarded.updateTree(updates);

		expect(actions.updateTree).toHaveBeenCalledWith(updates, undefined);
	});

	it("forwards $set updates regardless of the node at the path", () => {
		const updates = [{ path: [], spec: { $set: SPLIT_ROOT } }];
		const { actions, guarded } = createActions(LEAF_ROOT);
		guarded.updateTree(updates);

		expect(actions.updateTree).toHaveBeenCalledWith(updates, undefined);
	});
});
