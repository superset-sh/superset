// Reads setup.ts as source rather than importing it: importing links its named
// electron imports against whichever `mock.module("electron")` an earlier test
// file installed, and Bun cannot add an export the linked mock lacks.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const setupSource = readFileSync(join(import.meta.dirname, "setup.ts"), "utf8");

describe("app setup GPU policy", () => {
	test("leaves GPU acceleration to Chromium's blocklist (#5948)", () => {
		expect(setupSource).not.toMatch(/disableHardwareAcceleration\s*\(/);
		expect(setupSource).not.toMatch(/appendSwitch\(\s*["']disable-gpu/);
	});
});
