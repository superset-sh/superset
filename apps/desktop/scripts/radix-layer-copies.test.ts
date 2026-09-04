import { describe, expect, test } from "bun:test";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * Every Radix primitive the renderer mounts must share ONE copy of
 * `@radix-ui/react-dismissable-layer`. The layer keeps its stack and the
 * body `pointer-events` lock owner in module-level state; two copies never
 * see each other, so a menu from one copy opening a dialog from the other
 * leaves `body.style.pointerEvents = "none"` behind for good and the app
 * stops responding to clicks (desktop 1.25.1, via the context-menu bump in
 * #6898). Dependabot bumps Radix packages one at a time, which is exactly how
 * the split happens — this test fails the bump instead of the release. It
 * lives under scripts/ because renderer code may not import Node builtins;
 * the DOM-level regression is src/renderer/lib/radix-layers/.
 *
 * Resolution follows the real install: each package's dependencies are
 * resolved from that package's own realpath, so bun's isolated store is
 * walked the way the bundler walks it. Only Radix edges are followed, on
 * purpose: non-Radix packages that carry their own Radix copy (cmdk, vaul)
 * render nothing in the desktop bundle, and their nested copies can only be
 * aligned by moving every Radix package forward together.
 */

const LAYER = "@radix-ui/react-dismissable-layer";
const DESKTOP_DIR = resolve(import.meta.dir, "..");
const UI_DIR = resolve(import.meta.dir, "../../../packages/ui");

function readPackage(dir: string): {
	version: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
} {
	return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/** Directory of `name` as resolved from `from`, or null if unresolvable. */
function packageDirOf(name: string, from: string): string | null {
	let entry: string;
	try {
		entry = Bun.resolveSync(name, from);
	} catch {
		return null;
	}
	const real = realpathSync(entry);
	const marker = `${sep}node_modules${sep}${name.split("/").join(sep)}${sep}`;
	const at = real.lastIndexOf(marker);
	return at === -1 ? null : real.slice(0, at + marker.length - 1);
}

function isRadix(name: string): boolean {
	return name === "radix-ui" || name.startsWith("@radix-ui/");
}

/**
 * resolved layer directory -> "version via chain". Keyed by directory, not
 * version: bun's store can hold two installs of one version (different peer
 * sets), and each is its own module instance with its own lock state.
 */
function collectLayerCopies(rootDir: string, into: Map<string, string>): void {
	const root = readPackage(rootDir);
	const direct = Object.keys({
		...root.dependencies,
		...root.devDependencies,
	}).filter(isRadix);
	const visited = new Set<string>();

	const walk = (name: string, from: string, chain: string[]) => {
		const dir = packageDirOf(name, from);
		if (!dir) return;
		const key = `${dir}\0${name}`;
		if (visited.has(key)) return;
		visited.add(key);
		const pkg = readPackage(dir);
		if (name === LAYER) {
			if (!into.has(dir)) {
				into.set(dir, `${pkg.version} via ${chain.join(" > ")}`);
			}
			return;
		}
		for (const dep of Object.keys(pkg.dependencies ?? {}).filter(isRadix)) {
			walk(dep, dir, [...chain, dep]);
		}
	};

	for (const dep of direct) {
		walk(dep, rootDir, [`${rootDir.split(sep).slice(-2).join("/")}:${dep}`]);
	}
}

describe("Radix DismissableLayer copies", () => {
	test("packages/ui and apps/desktop resolve exactly one copy", () => {
		const copies = new Map<string, string>();
		collectLayerCopies(UI_DIR, copies);
		collectLayerCopies(DESKTOP_DIR, copies);

		expect(copies.size).toBeGreaterThan(0);
		// On failure the diff lists every copy with the chain that pulls it
		// in; align the outlier's package (or bump the whole Radix set).
		expect([...copies.values()]).toHaveLength(1);
	});
});
