import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Suggestions are data only: accepting one explicitly saves the command. */
export function detectSetupCommand(repoPath: string): string | null {
	let manifest: { packageManager?: unknown };
	try {
		manifest = JSON.parse(readFileSync(join(repoPath, "package.json"), "utf8"));
		if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
			return null;
	} catch {
		return null;
	}
	if (typeof manifest.packageManager === "string") {
		const manager = /^(pnpm|npm|yarn|bun)@\S+$/.exec(
			manifest.packageManager,
		)?.[1];
		return manager ? `${manager} install` : null;
	}
	const families = [
		["pnpm", ["pnpm-lock.yaml"]],
		["yarn", ["yarn.lock"]],
		["bun", ["bun.lock", "bun.lockb"]],
		["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
	] as const;
	const matches = families.filter(([, files]) =>
		files.some((file) => existsSync(join(repoPath, file))),
	);
	return matches.length > 1 ? null : `${matches[0]?.[0] ?? "npm"} install`;
}
