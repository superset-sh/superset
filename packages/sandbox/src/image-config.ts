import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT } from "./build";

const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");

// The repo pins bun once, in .bun-version; a sandbox on any other version
// rejects the frozen lockfile and every dependency install fails.
export const BUN_VERSION = readFileSync(
	join(REPO_ROOT, ".bun-version"),
	"utf8",
).trim();
export const GO_VERSION = "1.27.1";
/** Pinned by `bun run assets go`; verified before the tarball is unpacked. */
export const GO_SHA256 =
	"63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445";

export function aptList(name: string): string {
	return readFileSync(
		join(
			PACKAGE_ROOT,
			"bundle",
			"rootfs",
			"usr",
			"local",
			"share",
			"superset",
			`${name}.Aptfile`,
		),
		"utf8",
	)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"))
		.join(" ");
}
