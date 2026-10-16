import { describe, expect, test } from "bun:test";
import { packPluginBundle } from "@superset/shared/plugins/bundle";
import type { PluginManifest } from "./manifest";
import {
	organizationPluginProblem,
	readOrganizationBundle,
} from "./organization";

function manifest(extension: Record<string, unknown>): PluginManifest {
	return {
		name: "team-tools",
		version: "1.0.0",
		extensions: { superset: extension },
	} as PluginManifest;
}

describe("organizationPluginProblem", () => {
	test("a connector with its own tool server is allowed", () => {
		expect(
			organizationPluginProblem(manifest({ connector: { slug: "neon_mcp" } })),
		).toBeNull();
	});

	test("a connector served from Superset's own servers is refused", () => {
		expect(
			organizationPluginProblem(manifest({ connector: { slug: "slack" } })),
		).toContain("no tool server of its own");
	});

	test("a connector Superset does not define is refused", () => {
		expect(
			organizationPluginProblem(manifest({ connector: { slug: "acme" } })),
		).toContain("not a connector");
	});

	test("a Superset plugin's name is refused", () => {
		expect(
			organizationPluginProblem({
				...manifest({ connector: { slug: "neon_mcp" } }),
				name: "neon",
			}),
		).toContain("name of a Superset plugin");
	});

	test("a plugin with no connector needs an https tool server", () => {
		const mcp = (url: string) => ({ mcp: { type: "streamable-http", url } });
		expect(organizationPluginProblem(manifest({}))).toContain("no tools");
		expect(
			organizationPluginProblem(manifest(mcp("http://tools.test/mcp"))),
		).toContain("https");
		expect(
			organizationPluginProblem(manifest(mcp("https://tools.test/mcp"))),
		).toBeNull();
	});
});

describe("readOrganizationBundle", () => {
	const bundle = (files: Record<string, string>) =>
		packPluginBundle(
			new Map(
				Object.entries(files).map(([path, text]) => [path, Buffer.from(text)]),
			),
		);
	const pluginJson = JSON.stringify({
		name: "team-tools",
		version: "1.0.0",
		extensions: {
			superset: {
				mcp: { type: "streamable-http", url: "https://tools.test/mcp" },
			},
		},
	});

	test("reads the manifest of a tree that carries skills", () => {
		expect(
			readOrganizationBundle(
				bundle({ "plugin.json": pluginJson, "skills/triage/SKILL.md": "x" }),
			).name,
		).toBe("team-tools");
	});

	test("applies the organization rules to the manifest inside", () => {
		expect(() =>
			readOrganizationBundle(
				bundle({
					"plugin.json": JSON.stringify({ name: "neon", version: "1.0.0" }),
				}),
			),
		).toThrow();
	});

	test("refuses bytes that are not a bundle", () => {
		expect(() => readOrganizationBundle(Buffer.from("not gzip"))).toThrow(
			"not a plugin bundle",
		);
	});
});
