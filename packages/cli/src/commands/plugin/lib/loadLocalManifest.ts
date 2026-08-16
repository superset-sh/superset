import { readFile } from "node:fs/promises";
import path from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	type ParsedPluginManifest,
	PLUGIN_MANIFEST_FILENAME,
	parsePluginManifest,
} from "@superset/plugin-sdk/manifest";

export async function loadLocalManifest(
	dir: string,
): Promise<ParsedPluginManifest> {
	const manifestPath = path.join(dir, PLUGIN_MANIFEST_FILENAME);
	let raw: string;
	try {
		raw = await readFile(manifestPath, "utf8");
	} catch {
		throw new CLIError(
			`No ${PLUGIN_MANIFEST_FILENAME} in ${dir}`,
			"Run: superset plugin new <name> to scaffold one",
		);
	}
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch (error) {
		throw new CLIError(
			`Malformed ${PLUGIN_MANIFEST_FILENAME}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	try {
		return parsePluginManifest(json);
	} catch (error) {
		throw new CLIError(error instanceof Error ? error.message : String(error));
	}
}
