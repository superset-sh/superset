import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	collectPackageNameClosure,
	computeRuntimeTailExclusions,
} from "./runtime-closure";

test("drops bundled-only dependencies while retaining nested, optional and peer runtime edges", () => {
	const dir = mkdtempSync(join(tmpdir(), "superset-runtime-closure-"));
	const put = (name: string, manifest: object, base = dir) => {
		const path = join(base, "node_modules", name);
		mkdirSync(path, { recursive: true });
		writeFileSync(
			join(path, "package.json"),
			JSON.stringify({ name, ...manifest }),
		);
		return path;
	};
	try {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ dependencies: { native: "1", renderer: "1" } }),
		);
		const native = put("native", {
			dependencies: { binding: "1" },
			optionalDependencies: { missing: "1" },
			peerDependencies: { peer: "1" },
		});
		put("binding", {}, native);
		put("peer", {});
		put("renderer", { dependencies: { rendererChild: "1" } });
		put("rendererChild", {});
		const exclusions = computeRuntimeTailExclusions(dir, ["native"]);
		expect(exclusions).toEqual([
			"!**/node_modules/renderer/**",
			"!**/node_modules/rendererChild/**",
		]);
		expect([...collectPackageNameClosure(["native"], dir)].sort()).toEqual([
			"binding",
			"native",
			"peer",
		]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("refuses an unavailable required runtime seed", () => {
	const dir = mkdtempSync(join(tmpdir(), "superset-runtime-missing-"));
	try {
		writeFileSync(join(dir, "package.json"), "{}");
		expect(() => computeRuntimeTailExclusions(dir, ["missing"])).toThrow(
			"Missing runtime dependency: missing",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
