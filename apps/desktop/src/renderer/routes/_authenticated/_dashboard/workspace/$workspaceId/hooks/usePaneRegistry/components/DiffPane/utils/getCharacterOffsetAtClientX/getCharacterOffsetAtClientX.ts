/** Resolve a horizontal pointer position to a zero-based offset in a rendered
 * Pierre line. DOM ranges account for token spans, tabs, and proportional font
 * fallbacks without assuming a fixed character width. */
export function getCharacterOffsetAtClientX(
	lineElement: HTMLElement,
	clientX: number,
): number {
	const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT);
	let totalOffset = 0;
	let textNode = walker.nextNode();

	while (textNode) {
		const text = textNode.textContent ?? "";
		if (text.length > 0) {
			const nodeRange = document.createRange();
			nodeRange.selectNodeContents(textNode);
			const nodeRect = nodeRange.getBoundingClientRect();

			if (clientX <= nodeRect.right) {
				let low = 0;
				let high = text.length;
				while (low < high) {
					const middle = Math.floor((low + high) / 2);
					const characterRange = document.createRange();
					characterRange.setStart(textNode, middle);
					characterRange.setEnd(textNode, middle + 1);
					const rect = characterRange.getBoundingClientRect();
					const midpoint = rect.left + rect.width / 2;
					if (clientX < midpoint) high = middle;
					else low = middle + 1;
				}
				return totalOffset + low;
			}
			totalOffset += text.length;
		}
		textNode = walker.nextNode();
	}

	return totalOffset;
}
