import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const psFile = join(
	dirname(require.resolve("pidtree/package.json")),
	"lib/ps.js",
);

test("pidtree uses the absolute macOS ps path", () => {
	const source = readFileSync(psFile, "utf8");
	expect(source).toContain("os.platform() === 'darwin' ? '/bin/ps' : 'ps'");
});
