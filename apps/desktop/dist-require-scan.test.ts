import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectBareRequireSpecifiers } from "./dist-require-scan";

test("discovers renamed disk requires without interpreting generated code strings", () => {
	const dir = mkdtempSync(join(tmpdir(), "superset-require-scan-"));
	try {
		const file = join(dir, "host.js");
		writeFileSync(
			file,
			`require$1("@xterm/headless"); require("node:fs"); const generated='require("ajv/dist/runtime/equal")'; require("./local"); other("dead-package");`,
		);
		expect(collectBareRequireSpecifiers(file)).toEqual([
			"@xterm/headless",
			"node:fs",
		]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
