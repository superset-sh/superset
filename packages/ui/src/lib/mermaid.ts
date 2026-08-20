import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import type { Streamdown } from "streamdown";

/** Shared `plugins` prop for every `<Streamdown>` that renders mermaid. */
export const mermaidPlugins = { mermaid };

type MermaidProp = NonNullable<ComponentProps<typeof Streamdown>["mermaid"]>;
type MermaidConfig = NonNullable<MermaidProp["config"]>;

/**
 * Build the `mermaid` prop for `<Streamdown>` with HTML labels disabled.
 *
 * Mermaid defaults to `htmlLabels: true`, which renders node/edge labels inside
 * `<foreignObject>`. Streamdown's "Download as PNG" control rasterizes the
 * diagram by loading the SVG into an `<img>` and drawing it onto a `<canvas>`;
 * Chromium taints any canvas drawn from an `<img>` containing `<foreignObject>`,
 * so `canvas.toBlob()` returns null and the download silently fails (Streamdown
 * swallows the error). Forcing native SVG `<text>` labels keeps the canvas clean
 * so PNG export works, while SVG/MMD downloads are unaffected.
 */
export function mermaidConfig(config: MermaidConfig): MermaidProp {
	return {
		config: {
			...config,
			htmlLabels: false,
			flowchart: { ...config.flowchart, htmlLabels: false },
		},
	};
}
