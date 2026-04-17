// Lucide chevron paths, inlined so we return a plain HTMLElement (foldGutter's
// markerDOM contract) without bridging React. Matches lucide-react's
// ChevronDown and ChevronRight exactly.
const CHEVRON_DOWN_PATH = "m6 9 6 6 6-6";
const CHEVRON_RIGHT_PATH = "m9 18 6-6-6-6";

export function buildFoldChevron(open: boolean): HTMLElement {
	const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	el.setAttribute("viewBox", "0 0 24 24");
	el.setAttribute("fill", "none");
	el.setAttribute("stroke", "currentColor");
	el.setAttribute("stroke-width", "2");
	el.setAttribute("stroke-linecap", "round");
	el.setAttribute("stroke-linejoin", "round");
	el.setAttribute("class", "cm-foldChevron");
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", open ? CHEVRON_DOWN_PATH : CHEVRON_RIGHT_PATH);
	el.appendChild(path);
	return el as unknown as HTMLElement;
}
