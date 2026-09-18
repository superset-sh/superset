import { describe, expect, test } from "bun:test";
import { planV2SurfacePass } from "./pass";

describe("planV2SurfacePass", () => {
	test("unmigrated v1 data on a machine that never ran the v1-surface pass gets the full pass", () => {
		expect(
			planV2SurfacePass({
				followUpPending: false,
				migrationComplete: false,
				hasV1Data: true,
			}),
		).toBe("full");
	});

	test("v2-native machine with an empty local.db only backfills groups", () => {
		expect(
			planV2SurfacePass({
				followUpPending: false,
				migrationComplete: false,
				hasV1Data: false,
			}),
		).toBe("groups-only");
	});

	test("completed migration is not redone, so v2 deletions stay deleted", () => {
		expect(
			planV2SurfacePass({
				followUpPending: false,
				migrationComplete: true,
				hasV1Data: true,
			}),
		).toBe("groups-only");
	});

	test("pending follow-up runs the full pass even after completion", () => {
		expect(
			planV2SurfacePass({
				followUpPending: true,
				migrationComplete: true,
				hasV1Data: true,
			}),
		).toBe("full");
	});
});
