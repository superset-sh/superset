import { describe, expect, test } from "bun:test";
import { generateBranchName } from "./slug";

describe("generateBranchName", () => {
	test("applies shared branch sanitization to prefix", () => {
		const branch = generateBranchName("My New Feature", "FEAT/");
		expect(branch).toMatch(/^feat\/my-new-feature-[a-z0-9]{4}$/);
	});

	test("applies shared branch sanitization to nested prefix segments", () => {
		const branch = generateBranchName("Fix Login", "TEAM/Feature");
		expect(branch).toMatch(/^team\/feature\/fix-login-[a-z0-9]{4}$/);
	});

	test("removes invalid prefix characters using shared branch rules", () => {
		const branch = generateBranchName("Fix Login", "TEAM/Feat:ure?");
		expect(branch).toMatch(/^team\/feature\/fix-login-[a-z0-9]{4}$/);
	});
});
