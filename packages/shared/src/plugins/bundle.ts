import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export const PLUGIN_BUNDLE_MAX_BYTES = 2 * 1024 * 1024;
const PLUGIN_BUNDLE_MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
const PLUGIN_BUNDLE_MAX_FILES = 500;
const PLUGIN_BUNDLE_FORMAT = 1;

/** The top-level entries a plugin tree may carry, the same ones a git release installs. */
export const PLUGIN_TREE_ENTRIES = [
	"plugin.json",
	"skills",
	"commands",
] as const;

export class PluginBundleError extends Error {}

export function pluginBundleHash(bundle: Uint8Array): string {
	return createHash("sha256").update(bundle).digest("hex");
}

function assertTreePath(path: string): void {
	const segments = path.split("/");
	const top = segments[0] ?? "";
	if (
		!path ||
		path.includes("\\") ||
		path.includes("\0") ||
		segments.some((s) => !s || s === "." || s === "..") ||
		!(PLUGIN_TREE_ENTRIES as readonly string[]).includes(top) ||
		(top === "plugin.json" && segments.length > 1)
	) {
		throw new PluginBundleError(`"${path}" is not a path a plugin may carry`);
	}
}

export function packPluginBundle(
	files: ReadonlyMap<string, Uint8Array>,
): Buffer {
	const entries = [...files.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([path, data]) => {
			assertTreePath(path);
			return { path, content: Buffer.from(data).toString("base64") };
		});
	const bundle = gzipSync(
		JSON.stringify({ format: PLUGIN_BUNDLE_FORMAT, files: entries }),
	);
	if (bundle.length > PLUGIN_BUNDLE_MAX_BYTES) {
		throw new PluginBundleError(
			`the plugin is ${bundle.length} bytes packed, over the ${PLUGIN_BUNDLE_MAX_BYTES} byte limit`,
		);
	}
	return bundle;
}

export function unpackPluginBundle(bundle: Uint8Array): Map<string, Buffer> {
	if (bundle.length > PLUGIN_BUNDLE_MAX_BYTES) {
		throw new PluginBundleError(
			`the plugin is over the ${PLUGIN_BUNDLE_MAX_BYTES} byte limit`,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(
			gunzipSync(bundle, {
				maxOutputLength: PLUGIN_BUNDLE_MAX_UNPACKED_BYTES,
			}).toString("utf8"),
		);
	} catch {
		throw new PluginBundleError("the upload is not a plugin bundle");
	}

	const { format, files } = (parsed ?? {}) as {
		format?: unknown;
		files?: unknown;
	};
	if (format !== PLUGIN_BUNDLE_FORMAT || !Array.isArray(files)) {
		throw new PluginBundleError("the upload is not a plugin bundle");
	}
	if (files.length > PLUGIN_BUNDLE_MAX_FILES) {
		throw new PluginBundleError(
			`the plugin has ${files.length} files, over the limit of ${PLUGIN_BUNDLE_MAX_FILES}`,
		);
	}

	const out = new Map<string, Buffer>();
	for (const file of files as { path?: unknown; content?: unknown }[]) {
		if (typeof file?.path !== "string" || typeof file.content !== "string") {
			throw new PluginBundleError("the upload is not a plugin bundle");
		}
		assertTreePath(file.path);
		if (out.has(file.path)) {
			throw new PluginBundleError(`"${file.path}" appears twice`);
		}
		out.set(file.path, Buffer.from(file.content, "base64"));
	}
	if (!out.has("plugin.json")) {
		throw new PluginBundleError("it has no plugin.json at its root");
	}
	return out;
}
