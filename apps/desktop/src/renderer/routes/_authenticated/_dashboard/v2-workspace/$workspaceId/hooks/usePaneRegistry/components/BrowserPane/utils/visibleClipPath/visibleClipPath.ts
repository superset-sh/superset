interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

// The webview is hoisted out of the pane tree, so it does not inherit the
// clipping of the containers its placeholder sits in.
export function visibleClipPath(box: Box, clips: Box[]): string {
	let top = box.top;
	let left = box.left;
	let right = box.left + box.width;
	let bottom = box.top + box.height;
	for (const clip of clips) {
		top = Math.max(top, clip.top);
		left = Math.max(left, clip.left);
		right = Math.min(right, clip.left + clip.width);
		bottom = Math.min(bottom, clip.top + clip.height);
	}
	if (right <= left || bottom <= top) return "inset(50%)";
	const insets = [
		top - box.top,
		box.left + box.width - right,
		box.top + box.height - bottom,
		left - box.left,
	];
	if (insets.every((inset) => inset <= 0)) return "";
	return `inset(${insets.map((inset) => `${Math.max(0, inset)}px`).join(" ")})`;
}

export function clippingAncestorRects(element: Element): Box[] {
	const rects: Box[] = [];
	for (
		let ancestor = element.parentElement;
		ancestor && ancestor !== document.body;
		ancestor = ancestor.parentElement
	) {
		const style = getComputedStyle(ancestor);
		if (style.overflowX === "visible" && style.overflowY === "visible") {
			continue;
		}
		rects.push(ancestor.getBoundingClientRect());
	}
	return rects;
}
