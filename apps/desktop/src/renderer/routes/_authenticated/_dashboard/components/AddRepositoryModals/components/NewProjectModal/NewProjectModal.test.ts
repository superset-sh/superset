/// <reference types="bun" />

import { describe, expect, test } from "bun:test";

const source = await Bun.file(
	new URL("./NewProjectModal.tsx", import.meta.url),
).text();

describe("NewProjectModal clone progress wiring", () => {
	test("subscribes to project clone progress and passes a request id", () => {
		expect(source).toContain('"project:create-progress"');
		expect(source).toContain("progressRequestId");
		expect(source).toContain("getEventBus(activeHostUrl");
		expect(source).toContain("getHostServiceWsToken(activeHostUrl)");
	});

	test("renders clone progress and lets the dialog hide while work continues", () => {
		expect(source).toContain("formatProgressPercent(progress)");
		expect(source).toContain('aria-live="polite"');
		expect(source).toContain('{working ? "Hide" : "Cancel"}');
	});
});
