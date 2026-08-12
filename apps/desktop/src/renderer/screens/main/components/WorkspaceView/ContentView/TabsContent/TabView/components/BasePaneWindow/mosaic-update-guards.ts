import type {
	MosaicNode,
	MosaicRootActions,
	MosaicUpdate,
} from "react-mosaic-component";
import {
	createHideUpdate,
	getNodeAtPath,
	isParent,
} from "react-mosaic-component";

export function canApplyMosaicUpdate<T extends string | number>(
	root: MosaicNode<T> | null,
	update: MosaicUpdate<T>,
): boolean {
	if ("$set" in update.spec) return true;

	const node = getNodeAtPath(root, update.path);
	return node !== null && isParent(node);
}

export function guardMosaicActions<T extends string | number>(
	actions: MosaicRootActions<T>,
): MosaicRootActions<T> {
	return {
		...actions,
		hide: (path) => {
			if (canApplyMosaicUpdate(actions.getRoot(), createHideUpdate<T>(path))) {
				actions.hide(path);
			}
		},
		updateTree: (updates, suppressOnRelease) => {
			const root = actions.getRoot();
			const applicable = updates.filter((update) =>
				canApplyMosaicUpdate(root, update),
			);
			if (applicable.length > 0) {
				actions.updateTree(applicable, suppressOnRelease);
			}
		},
	};
}
