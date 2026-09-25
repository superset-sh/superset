import { type MermaidConfig, mermaid } from "@streamdown/mermaid";
import type { MermaidOptions, PluginConfig } from "streamdown";

/** Shared `plugins` prop for every `<Streamdown>` that renders mermaid. */
export const mermaidPlugins: PluginConfig = { mermaid };

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
 *
 * `htmlLabels` is spread last so a caller cannot re-enable it. Only the root
 * key is set: mermaid 11.16 resolves `htmlLabels ?? flowchart.htmlLabels` and
 * logs a deprecation warning whenever `flowchart.htmlLabels` is present.
 */
export function mermaidConfig(config: MermaidConfig = {}): MermaidOptions {
	return { config: { ...config, htmlLabels: false } };
}
