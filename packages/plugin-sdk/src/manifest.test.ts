import { describe, expect, test } from "bun:test";
import { parsePluginManifest } from "./manifest";

const base = {
	id: "acme.example",
	name: "Example",
	version: "1.0.0",
};

describe("parsePluginManifest", () => {
	test("accepts a minimal manifest", () => {
		const { manifest, warnings } = parsePluginManifest(base);
		expect(manifest.id).toBe("acme.example");
		expect(warnings).toEqual([]);
	});

	test("rejects non-namespaced ids", () => {
		expect(() => parsePluginManifest({ ...base, id: "example" })).toThrow(
			/dot-namespaced/,
		);
	});

	test("rejects entry paths escaping the plugin root", () => {
		for (const server of ["/etc/passwd", "../outside.js", "a/../../b.js"]) {
			expect(() => parsePluginManifest({ ...base, server })).toThrow(
				/relative to the plugin root/,
			);
		}
	});

	test("rejects UI contributions without an app bundle", () => {
		expect(() =>
			parsePluginManifest({
				...base,
				contributes: {
					sidebarTabs: [{ id: "t", label: "T", component: "Tab" }],
				},
			}),
		).toThrow(/require an "app" bundle/);
	});

	test("rejects commands opening unknown sidebar tabs", () => {
		expect(() =>
			parsePluginManifest({
				...base,
				app: "dist/app.js",
				contributes: {
					sidebarTabs: [{ id: "t", label: "T", component: "Tab" }],
					commands: [
						{
							id: "open",
							title: "Open",
							run: { type: "open-sidebar-tab", tabId: "missing" },
						},
					],
				},
			}),
		).toThrow(/unknown sidebar tab/);
	});

	test("warns on pane kinds not prefixed with the plugin id", () => {
		const { warnings } = parsePluginManifest({
			...base,
			app: "dist/app.js",
			contributes: {
				panes: [{ kind: "other.pane", title: "P", component: "Pane" }],
			},
		});
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("other.pane");
	});

	test("rejects unknown event kinds", () => {
		expect(() =>
			parsePluginManifest({
				...base,
				contributes: {
					events: [{ on: "terminal.output", command: ["echo"] }],
				},
			}),
		).toThrow(/Invalid superset-plugin.json/);
	});
});
