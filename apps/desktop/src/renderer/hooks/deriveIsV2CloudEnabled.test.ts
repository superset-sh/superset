import { describe, expect, test } from "bun:test";
import { deriveIsV2CloudEnabled } from "./deriveIsV2CloudEnabled";

describe("deriveIsV2CloudEnabled — silent v1 fallback (#5498)", () => {
	test("explicit opt-in wins over everything", () => {
		expect(
			deriveIsV2CloudEnabled({
				optInV2: true,
				isV2OnlyUser: false,
				isDev: false,
			}),
		).toBe(true);
	});

	test("explicit opt-out wins even for v2-only users and dev", () => {
		expect(
			deriveIsV2CloudEnabled({
				optInV2: false,
				isV2OnlyUser: true,
				isDev: true,
			}),
		).toBe(false);
	});

	test("no local preference: v2-only users default to v2", () => {
		expect(
			deriveIsV2CloudEnabled({
				optInV2: null,
				isV2OnlyUser: true,
				isDev: false,
			}),
		).toBe(true);
	});

	test("no local preference: dev builds default to v2", () => {
		expect(
			deriveIsV2CloudEnabled({
				optInV2: null,
				isV2OnlyUser: false,
				isDev: true,
			}),
		).toBe(true);
	});

	// REPRO for #5498: a pre-cutoff user who opted in has their only source
	// of truth in renderer localStorage. Losing it reverts optInV2 to null
	// and silently drops them back to the legacy v1 dashboard.
	test("REPRO: losing localStorage silently drops a pre-cutoff opt-in to v1", () => {
		const preCutoff = deriveIsV2CloudEnabled({
			optInV2: true,
			isV2OnlyUser: false,
			isDev: false,
		});
		expect(preCutoff).toBe(true);

		const afterWipe = deriveIsV2CloudEnabled({
			optInV2: null,
			isV2OnlyUser: false,
			isDev: false,
		});
		expect(afterWipe).toBe(false);
	});
});
