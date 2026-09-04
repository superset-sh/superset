import { describe, expect, it, mock } from "bun:test";

mock.module("@streamdown/mermaid", () => ({ mermaid: {} }));

const { mermaidConfig } = await import("./mermaid");

describe("mermaidConfig", () => {
	it("disables HTML labels so the PNG export canvas is not tainted", () => {
		expect(mermaidConfig().config?.htmlLabels).toBe(false);
	});

	it("keeps the caller's config", () => {
		const { config } = mermaidConfig({
			theme: "dark",
			themeVariables: { lineColor: "#888" },
		});
		expect(config?.theme).toBe("dark");
		expect(config?.themeVariables).toEqual({ lineColor: "#888" });
	});

	it("wins over a caller re-enabling HTML labels", () => {
		expect(mermaidConfig({ htmlLabels: true }).config?.htmlLabels).toBe(false);
	});

	it("leaves the deprecated flowchart.htmlLabels unset", () => {
		expect(
			mermaidConfig({ flowchart: { curve: "basis" } }).config?.flowchart,
		).toEqual({
			curve: "basis",
		});
	});
});
