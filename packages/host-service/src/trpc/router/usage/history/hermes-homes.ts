import { readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The default Hermes home, each profile under it (`profiles/<name>` is its
 * own HERMES_HOME), and HERMES_HOME itself. */
export function hermesHomes(
	home: string = homedir(),
	env: NodeJS.ProcessEnv = process.env,
): string[] {
	const root =
		process.platform === "win32"
			? join(
					env.LOCALAPPDATA?.trim() || join(home, "AppData", "Local"),
					"hermes",
				)
			: join(home, ".hermes");
	const candidates = [root];
	try {
		for (const profile of readdirSync(join(root, "profiles"), {
			withFileTypes: true,
		})) {
			if (profile.isDirectory()) {
				candidates.push(join(root, "profiles", profile.name));
			}
		}
	} catch {}
	const fromEnv = env.HERMES_HOME?.trim();
	if (fromEnv) candidates.push(fromEnv.replace(/^~(?=$|[/\\])/, home));
	// Real paths, so HERMES_HOME spelled with a trailing slash or through a
	// symlink does not scan the same state.db twice.
	const homes = new Set<string>();
	for (const candidate of candidates) {
		try {
			homes.add(realpathSync(candidate));
		} catch {}
	}
	return [...homes];
}
