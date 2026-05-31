import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { ModelSelectorLogo } from "./model-selector";

describe("ModelSelectorLogo", () => {
	it("renders bundled local provider logos without remote URLs", () => {
		const source = readFileSync(
			join(import.meta.dir, "model-selector.tsx"),
			"utf8",
		);

		expect(source).not.toContain(["https://", "models.dev"].join(""));
		expect(
			renderToStaticMarkup(<ModelSelectorLogo provider="openai" />),
		).not.toContain("https://");
	});
});
