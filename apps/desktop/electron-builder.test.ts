import { describe, expect, test } from "bun:test";
import config from "./electron-builder";

describe("electron-builder mac config", () => {
	test("includes x64 architecture so Intel Mac users can run the app", () => {
		const macTarget = config.mac?.target;
		expect(macTarget).toBeDefined();

		const archs: string[] = [];
		if (Array.isArray(macTarget)) {
			for (const t of macTarget) {
				if (typeof t === "object" && t !== null && "arch" in t) {
					archs.push(...(t.arch as string[]));
				}
			}
		}

		expect(archs).toContain("x64");
	});

	test("includes arm64 architecture for Apple Silicon Macs", () => {
		const macTarget = config.mac?.target;
		expect(macTarget).toBeDefined();

		const archs: string[] = [];
		if (Array.isArray(macTarget)) {
			for (const t of macTarget) {
				if (typeof t === "object" && t !== null && "arch" in t) {
					archs.push(...(t.arch as string[]));
				}
			}
		}

		expect(archs).toContain("arm64");
	});
});
