import fs from "node:fs";
import path from "node:path";
import { writePluginTree } from "@superset/agent-setup";
import { CLIError } from "@superset/cli-framework";
import {
	PLUGIN_TREE_ENTRIES,
	packPluginBundle,
	pluginBundleHash,
	unpackPluginBundle,
} from "@superset/shared/plugins/bundle";
import type { ApiClient } from "../api-client";
import { type InstallPluginResult, recordPlugin } from "./install";

function readTree(root: string): Map<string, Buffer> {
	const files = new Map<string, Buffer>();
	const walk = (relative: string) => {
		const absolute = path.join(root, relative);
		const stat = fs.lstatSync(absolute);
		if (stat.isSymbolicLink()) {
			throw new CLIError(`Refusing to upload "${relative}": it is a symlink.`);
		}
		if (stat.isDirectory()) {
			for (const entry of fs.readdirSync(absolute)) {
				if (entry.startsWith(".")) continue;
				walk(path.posix.join(relative, entry));
			}
		} else if (stat.isFile()) {
			files.set(relative, fs.readFileSync(absolute));
		}
	};
	for (const entry of PLUGIN_TREE_ENTRIES) {
		if (fs.existsSync(path.join(root, entry))) walk(entry);
	}
	return files;
}

/** A plugin directory, or its plugin.json, packed the way the API stores it. */
export function packPluginDirectory(target: string): string {
	const resolved = path.resolve(target);
	const root =
		path.basename(resolved) === "plugin.json"
			? path.dirname(resolved)
			: resolved;
	if (!fs.existsSync(path.join(root, "plugin.json"))) {
		throw new CLIError(`No plugin.json in ${root}.`);
	}
	return packPluginBundle(readTree(root)).toString("base64");
}

export async function installOrganizationPlugin(
	api: ApiClient,
	name: string,
): Promise<InstallPluginResult> {
	const download = await api.plugins.organization.bundle.query({ name });
	const bundle = Buffer.from(download.bundle, "base64");
	if (pluginBundleHash(bundle) !== download.contentHash) {
		throw new CLIError(
			`The download of "${name}" does not match what was uploaded. Try again.`,
		);
	}
	const installPath = writePluginTree(
		download.marketplace,
		download.name,
		download.version,
		unpackPluginBundle(bundle),
	);
	return await recordPlugin({
		name: download.name,
		marketplace: download.marketplace,
		version: download.version,
		installPath,
	});
}
