import { describe, expect, test } from "bun:test";
import {
	type DesktopNotice,
	filterApplicableNotices,
	type NoticeClientContext,
} from "./desktop-notices";

function makeNotice(overrides: Partial<DesktopNotice> = {}): DesktopNotice {
	return {
		id: "n1",
		severity: "warning",
		trigger: "immediate",
		minVersion: null,
		maxVersion: null,
		platforms: null,
		channels: null,
		title: "t",
		body: "b",
		cta: null,
		dismissible: true,
		...overrides,
	};
}

function makeCtx(
	overrides: Partial<NoticeClientContext> = {},
): NoticeClientContext {
	return {
		appVersion: "1.14.2",
		platform: "darwin",
		channel: "stable",
		previousVersion: null,
		isDismissed: () => false,
		...overrides,
	};
}

describe("filterApplicableNotices", () => {
	test("untargeted notice applies", () => {
		expect(filterApplicableNotices([makeNotice()], makeCtx())).toHaveLength(1);
	});

	test("maxVersion bounds: below shows, above hides", () => {
		const notice = makeNotice({ maxVersion: "1.99.0" });
		expect(filterApplicableNotices([notice], makeCtx())).toHaveLength(1);
		expect(
			filterApplicableNotices([notice], makeCtx({ appVersion: "2.0.0" })),
		).toHaveLength(0);
	});

	test("minVersion bounds: above shows, below hides", () => {
		const notice = makeNotice({ minVersion: "1.10.0" });
		expect(filterApplicableNotices([notice], makeCtx())).toHaveLength(1);
		expect(
			filterApplicableNotices([notice], makeCtx({ appVersion: "1.9.0" })),
		).toHaveLength(0);
	});

	test("semver compares numerically, not lexically", () => {
		const notice = makeNotice({ maxVersion: "9.0.0" });
		expect(
			filterApplicableNotices([notice], makeCtx({ appVersion: "10.0.0" })),
		).toHaveLength(0);
	});

	test("canary prerelease versions coerce into range", () => {
		const notice = makeNotice({ maxVersion: "1.99.0" });
		expect(
			filterApplicableNotices(
				[notice],
				makeCtx({
					appVersion: "1.14.1-canary.20260711221936",
					channel: "canary",
				}),
			),
		).toHaveLength(1);
	});

	test("platform and channel targeting", () => {
		const notice = makeNotice({ platforms: ["win32"], channels: ["canary"] });
		expect(filterApplicableNotices([notice], makeCtx())).toHaveLength(0);
		expect(
			filterApplicableNotices(
				[notice],
				makeCtx({ platform: "win32", channel: "canary" }),
			),
		).toHaveLength(1);
	});

	test("dismissal hides dismissible notices only", () => {
		const dismissed = makeCtx({ isDismissed: () => true });
		expect(filterApplicableNotices([makeNotice()], dismissed)).toHaveLength(0);
		expect(
			filterApplicableNotices(
				[makeNotice({ severity: "blocking", dismissible: false })],
				dismissed,
			),
		).toHaveLength(1);
	});

	test("orders by severity, blocking first", () => {
		const result = filterApplicableNotices(
			[
				makeNotice({ id: "a", severity: "info" }),
				makeNotice({ id: "b", severity: "blocking", dismissible: false }),
				makeNotice({ id: "c", severity: "warning" }),
			],
			makeCtx(),
		);
		expect(result.map((n) => n.id)).toEqual(["b", "c", "a"]);
	});

	test("post-update: hidden on fresh installs, shown after updating into range", () => {
		const notice = makeNotice({ trigger: "post-update", minVersion: "1.14.0" });
		// fresh install: no previous version
		expect(filterApplicableNotices([notice], makeCtx())).toHaveLength(0);
		// updated 1.13 → 1.14.2: announce
		expect(
			filterApplicableNotices([notice], makeCtx({ previousVersion: "1.13.0" })),
		).toHaveLength(1);
		// updated 1.14.0 → 1.14.2: already had the announced release
		expect(
			filterApplicableNotices([notice], makeCtx({ previousVersion: "1.14.0" })),
		).toHaveLength(0);
	});

	test("unparseable app version fails open (no notices)", () => {
		expect(
			filterApplicableNotices(
				[makeNotice({ maxVersion: "1.99.0" })],
				makeCtx({ appVersion: "not-a-version" }),
			),
		).toHaveLength(0);
	});
});
