/**
 * node-pty enables MSVC Spectre mitigation in its gyp files, which requires
 * optional "Spectre-mitigated libs" in VS Build Tools. Many Windows dev setups
 * omit those; disabling mitigation matches relaxed local builds and fixes MSB8040.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function patchNodePtySpectreForWindows(): void {
	if (process.platform !== "win32") {
		return;
	}

	let nodePtyDir: string;
	try {
		const req = createRequire(join(process.cwd(), "apps/desktop/package.json"));
		const pkgJson = req.resolve("node-pty/package.json");
		nodePtyDir = dirname(pkgJson);
	} catch {
		return;
	}

	const files = [
		join(nodePtyDir, "binding.gyp"),
		join(nodePtyDir, "deps", "winpty", "src", "winpty.gyp"),
	];

	for (const file of files) {
		try {
			const before = readFileSync(file, "utf8");
			const after = before.replaceAll(
				"'SpectreMitigation': 'Spectre'",
				"'SpectreMitigation': 'false'",
			);
			if (after !== before) {
				writeFileSync(file, after);
			}
		} catch {
			// Optional paths (e.g. layout change) — ignore.
		}
	}
}
