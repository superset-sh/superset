import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** An icon component as an image URL, for chips that only carry a string. */
export function iconDataUrl(
	Icon: ComponentType<{ color?: string; size?: number | string }>,
	color: string,
): string {
	const svg = renderToStaticMarkup(<Icon color={color} />);
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
