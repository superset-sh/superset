import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { Switch } from "./switch";

describe("Switch", () => {
	it("renders as an accessible switch without Radix Switch", () => {
		const source = readFileSync(join(import.meta.dir, "switch.tsx"), "utf8");

		expect(source).not.toContain("@radix-ui/react-switch");
		expect(
			renderToStaticMarkup(<Switch checked aria-label="Enabled" />),
		).toContain('role="switch"');
		expect(
			renderToStaticMarkup(<Switch checked aria-label="Enabled" />),
		).toContain('aria-checked="true"');
	});
});
