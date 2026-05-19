import { describe, expect, it } from "bun:test";

import {
	getDeploymentProfile,
	isLocalProfile,
	isStrictProfile,
	shouldSkipEnvValidation,
} from "./deployment-profile";

describe("deployment profile resolution", () => {
	it("defaults to internal strict mode", () => {
		const env: Record<string, string | undefined> = {};

		expect(getDeploymentProfile(env)).toBe("internal");
		expect(isStrictProfile(getDeploymentProfile(env))).toBe(true);
		expect(shouldSkipEnvValidation(env)).toBe(false);
	});

	it("uses explicit local profile for lenient contributor development", () => {
		const env = { SUPERSET_PROFILE: "local" };

		expect(getDeploymentProfile(env)).toBe("local");
		expect(isLocalProfile(getDeploymentProfile(env))).toBe(true);
		expect(isStrictProfile(getDeploymentProfile(env))).toBe(false);
		expect(shouldSkipEnvValidation(env)).toBe(true);
	});

	it("uses ci only when no explicit or cloud profile is present", () => {
		expect(getDeploymentProfile({ CI: "true" })).toBe("ci");
		expect(getDeploymentProfile({ CI: "1" })).toBe("ci");
		expect(
			getDeploymentProfile({ CI: "true", SUPERSET_PROFILE: "internal" }),
		).toBe("internal");
	});

	it("keeps cloud strict above local and ci flags", () => {
		const env = {
			VERCEL: "1",
			CI: "true",
			SUPERSET_PROFILE: "local",
		};

		expect(getDeploymentProfile(env)).toBe("cloud");
		expect(isStrictProfile(getDeploymentProfile(env))).toBe(true);
		expect(shouldSkipEnvValidation(env)).toBe(false);
	});

	it("treats VERCEL_ENV as cloud", () => {
		expect(getDeploymentProfile({ VERCEL_ENV: "preview", CI: "true" })).toBe(
			"cloud",
		);
	});

	it("allows SKIP_ENV_VALIDATION as an explicit strict-profile escape hatch", () => {
		const env = { SKIP_ENV_VALIDATION: "1" };

		expect(getDeploymentProfile(env)).toBe("internal");
		expect(shouldSkipEnvValidation(env)).toBe(true);
	});

	it("throws on invalid explicit profiles", () => {
		expect(() =>
			getDeploymentProfile({ SUPERSET_PROFILE: "external" }),
		).toThrow(/Invalid SUPERSET_PROFILE/);
	});
});
