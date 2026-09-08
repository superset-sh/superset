import { describe, expect, test } from "bun:test";
import {
	DISABLE_HW_ACCEL_ENV,
	DISABLE_HW_ACCEL_FLAG,
	shouldDisableHardwareAcceleration,
} from "./gpu-acceleration";

const NO_OPT_OUT = { argv: ["/usr/bin/superset"], env: {} };

describe("shouldDisableHardwareAcceleration", () => {
	test("keeps the GPU enabled by default (#5948)", () => {
		expect(shouldDisableHardwareAcceleration(NO_OPT_OUT)).toBe(false);
	});

	test("is not platform-dependent — Linux gets the GPU like macOS/Windows", () => {
		// The regression was a blanket `PLATFORM.IS_LINUX && disable...`, so the
		// decision must not read process.platform at all.
		expect(shouldDisableHardwareAcceleration(NO_OPT_OUT)).toBe(false);
		expect(
			shouldDisableHardwareAcceleration({
				argv: ["/usr/bin/superset", "--no-sandbox"],
				env: { XDG_SESSION_TYPE: "wayland" },
			}),
		).toBe(false);
	});

	test("honors the explicit argv flag", () => {
		expect(
			shouldDisableHardwareAcceleration({
				argv: ["/usr/bin/superset", DISABLE_HW_ACCEL_FLAG],
				env: {},
			}),
		).toBe(true);
	});

	test("honors the argv flag in `=value` form", () => {
		expect(
			shouldDisableHardwareAcceleration({
				argv: [`${DISABLE_HW_ACCEL_FLAG}=true`],
				env: {},
			}),
		).toBe(true);
		expect(
			shouldDisableHardwareAcceleration({
				argv: [`${DISABLE_HW_ACCEL_FLAG}=false`],
				env: { [DISABLE_HW_ACCEL_ENV]: "1" },
			}),
		).toBe(false);
	});

	test("honors the env opt-out", () => {
		for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
			expect(
				shouldDisableHardwareAcceleration({
					argv: [],
					env: { [DISABLE_HW_ACCEL_ENV]: value },
				}),
			).toBe(true);
		}
	});

	test("ignores falsy/garbage env values", () => {
		for (const value of ["", "0", "false", "no", "maybe"]) {
			expect(
				shouldDisableHardwareAcceleration({
					argv: [],
					env: { [DISABLE_HW_ACCEL_ENV]: value },
				}),
			).toBe(false);
		}
	});

	test("does not match unrelated flags with the same prefix", () => {
		expect(
			shouldDisableHardwareAcceleration({
				argv: [`${DISABLE_HW_ACCEL_FLAG}-probe`],
				env: {},
			}),
		).toBe(false);
	});
});
