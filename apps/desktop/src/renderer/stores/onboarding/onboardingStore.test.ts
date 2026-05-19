import { describe, expect, test } from "bun:test";
import {
	getApplicableOnboardingSteps,
	getNextApplicableStep,
	getPrevApplicableStep,
	isStepApplicable,
	ONBOARDING_STEP_ORDER,
} from "./onboardingStore";

// Regression coverage for #4517: on Linux/Windows the macOS-specific permissions
// step (Full Disk Access, Accessibility) used to leave users stuck on the setup
// flow because the "Continue" button could never be enabled.

describe("onboarding step platform filtering", () => {
	test("permissions step is the only mac-gated step", () => {
		expect(isStepApplicable("permissions", "darwin")).toBe(true);
		expect(isStepApplicable("permissions", "linux")).toBe(false);
		expect(isStepApplicable("permissions", "win32")).toBe(false);

		for (const step of ONBOARDING_STEP_ORDER) {
			if (step === "permissions") continue;
			expect(isStepApplicable(step, "linux")).toBe(true);
			expect(isStepApplicable(step, "win32")).toBe(true);
			expect(isStepApplicable(step, "darwin")).toBe(true);
		}
	});

	test("treat unknown/loading platform as macOS so darwin users don't flicker", () => {
		expect(isStepApplicable("permissions", undefined)).toBe(true);
		expect(getApplicableOnboardingSteps(undefined)).toContain("permissions");
	});

	test("getApplicableOnboardingSteps drops permissions on non-darwin", () => {
		const linux = getApplicableOnboardingSteps("linux");
		expect(linux).not.toContain("permissions");
		expect(linux).toEqual([
			"providers",
			"gh-cli",
			"project",
			"adopt-worktrees",
		]);

		const win = getApplicableOnboardingSteps("win32");
		expect(win).not.toContain("permissions");

		const mac = getApplicableOnboardingSteps("darwin");
		expect(mac).toEqual([
			"providers",
			"gh-cli",
			"permissions",
			"project",
			"adopt-worktrees",
		]);
	});

	test("next step skips permissions on linux so gh-cli -> project", () => {
		expect(getNextApplicableStep("gh-cli", "linux")).toBe("project");
		expect(getNextApplicableStep("gh-cli", "win32")).toBe("project");
		expect(getNextApplicableStep("gh-cli", "darwin")).toBe("permissions");
	});

	test("prev step skips permissions on linux so back from project -> gh-cli", () => {
		expect(getPrevApplicableStep("project", "linux")).toBe("gh-cli");
		expect(getPrevApplicableStep("project", "win32")).toBe("gh-cli");
		expect(getPrevApplicableStep("project", "darwin")).toBe("permissions");
	});

	test("if a non-darwin user lands on the permissions step, navigating forward goes to project", () => {
		// This is the core of #4517: the user was stuck on the permissions page. They
		// should now be auto-advanced to the next applicable step.
		expect(getNextApplicableStep("permissions", "linux")).toBe("project");
	});

	test("returns null at the boundaries", () => {
		expect(getNextApplicableStep("adopt-worktrees", "darwin")).toBeNull();
		expect(getNextApplicableStep("adopt-worktrees", "linux")).toBeNull();
		expect(getPrevApplicableStep("providers", "darwin")).toBeNull();
		expect(getPrevApplicableStep("providers", "linux")).toBeNull();
	});
});
