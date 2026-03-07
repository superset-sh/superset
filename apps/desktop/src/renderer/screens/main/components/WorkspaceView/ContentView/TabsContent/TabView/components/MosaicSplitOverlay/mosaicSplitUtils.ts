import type { MosaicNode, MosaicPath } from "react-mosaic-component";

export interface BoundingBox {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface SplitInfo {
	path: MosaicPath;
	direction: "row" | "column";
	boundingBox: BoundingBox;
	splitPercentage: number;
}

export function getAbsoluteSplitPercentage(
	box: BoundingBox,
	splitPercentage: number,
	direction: "row" | "column",
): number {
	if (direction === "column") {
		const height = 100 - box.top - box.bottom;
		return (height * splitPercentage) / 100 + box.top;
	}
	const width = 100 - box.right - box.left;
	return (width * splitPercentage) / 100 + box.left;
}

export function getRelativeSplitPercentage(
	box: BoundingBox,
	absolutePercentage: number,
	direction: "row" | "column",
): number {
	if (direction === "column") {
		const height = 100 - box.top - box.bottom;
		return ((absolutePercentage - box.top) / height) * 100;
	}
	const width = 100 - box.right - box.left;
	return ((absolutePercentage - box.left) / width) * 100;
}

export function splitBox(
	box: BoundingBox,
	splitPercentage: number,
	direction: "row" | "column",
): { first: BoundingBox; second: BoundingBox } {
	const abs = getAbsoluteSplitPercentage(box, splitPercentage, direction);
	if (direction === "column") {
		return {
			first: { ...box, bottom: 100 - abs },
			second: { ...box, top: abs },
		};
	}
	return {
		first: { ...box, right: 100 - abs },
		second: { ...box, left: abs },
	};
}

export function collectSplits(
	node: MosaicNode<string>,
	box: BoundingBox,
	path: MosaicPath,
	out: SplitInfo[],
): void {
	if (typeof node === "string") return;

	const pct = node.splitPercentage ?? 50;
	out.push({
		path,
		direction: node.direction,
		boundingBox: box,
		splitPercentage: pct,
	});

	const { first, second } = splitBox(box, pct, node.direction);
	collectSplits(node.first, first, [...path, "first"], out);
	collectSplits(node.second, second, [...path, "second"], out);
}

export const MIN_PERCENTAGE = 20;
export const HANDLE_SIZE = 20;
export const KEYBOARD_STEP = 5;

export function updateSplitPercentage(
	node: MosaicNode<string>,
	path: MosaicPath,
	newPercentage: number,
): MosaicNode<string> {
	if (path.length === 0) {
		if (typeof node === "string") return node;
		return { ...node, splitPercentage: newPercentage };
	}
	if (typeof node === "string") return node;
	const [head, ...rest] = path;
	return {
		...node,
		[head]: updateSplitPercentage(node[head], rest, newPercentage),
	};
}

export function equalizeSplitPercentages(
	node: MosaicNode<string>,
): MosaicNode<string> {
	if (typeof node === "string") return node;
	return {
		...node,
		splitPercentage: 50,
		first: equalizeSplitPercentages(node.first),
		second: equalizeSplitPercentages(node.second),
	};
}
