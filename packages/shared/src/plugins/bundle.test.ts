import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
	PluginBundleError,
	packPluginBundle,
	pluginBundleHash,
	unpackPluginBundle,
} from "./bundle";

const tree = new Map([
	["plugin.json", Buffer.from('{"name":"team-tools"}')],
	["skills/triage/SKILL.md", Buffer.from("---\nname: triage\n---\n")],
]);

function raw(files: unknown[]): Buffer {
	return gzipSync(JSON.stringify({ format: 1, files }));
}

describe("plugin bundles", () => {
	test("a tree comes back byte for byte, and packs the same way twice", () => {
		const bundle = packPluginBundle(tree);
		expect(unpackPluginBundle(bundle)).toEqual(tree);
		expect(
			pluginBundleHash(packPluginBundle(new Map([...tree].reverse()))),
		).toBe(pluginBundleHash(bundle));
	});

	test("a path outside the plugin tree is refused", () => {
		for (const path of [
			"../escape",
			"skills/../../x",
			"/etc/passwd",
			"src/server.js",
			"plugin.json/x",
		]) {
			expect(() =>
				unpackPluginBundle(
					raw([
						{ path: "plugin.json", content: "e30=" },
						{ path, content: "" },
					]),
				),
			).toThrow(PluginBundleError);
		}
	});

	test("a bundle without plugin.json is refused", () => {
		expect(() =>
			unpackPluginBundle(raw([{ path: "skills/a/SKILL.md", content: "" }])),
		).toThrow("no plugin.json");
	});
});
