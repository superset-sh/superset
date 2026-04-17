import type { EditorView } from "@codemirror/view";

// Lucide MoreHorizontal (three dots) — inline SVG built imperatively so we can
// return a plain HTMLElement to CM's placeholderDOM contract.
export function buildFoldPlaceholder(
	_view: EditorView,
	onclick: (event: Event) => void,
): HTMLElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "cm-foldPlaceholder";
	button.setAttribute("aria-label", "Unfold");
	button.addEventListener("click", onclick);

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("class", "cm-foldPlaceholderIcon");
	for (const cx of ["5", "12", "19"]) {
		const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		c.setAttribute("cx", cx);
		c.setAttribute("cy", "12");
		c.setAttribute("r", "1");
		svg.appendChild(c);
	}
	button.appendChild(svg);
	return button;
}
