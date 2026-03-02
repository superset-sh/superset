import { describe, expect, test } from "bun:test";
import { getPRActionState } from "./pr-action-state";

describe("getPRActionState", () => {
	test("allows creating a PR only when branch is published, synced, and non-default", () => {
		const state = getPRActionState({
			hasRepo: true,
			hasExistingPR: false,
			hasUpstream: true,
			pushCount: 0,
			pullCount: 0,
			isDefaultBranch: false,
		});

		expect(state.canCreatePR).toBe(true);
		expect(state.createPRBlockedReason).toBeNull();
	});

	test("blocks create when PR already exists", () => {
		const state = getPRActionState({
			hasRepo: true,
			hasExistingPR: true,
			hasUpstream: true,
			pushCount: 0,
			pullCount: 0,
			isDefaultBranch: false,
		});

		expect(state.canCreatePR).toBe(false);
		expect(state.createPRBlockedReason).toBeNull();
	});

	test("blocks create when branch is unpublished", () => {
		const state = getPRActionState({
			hasRepo: true,
			hasExistingPR: false,
			hasUpstream: false,
			pushCount: 0,
			pullCount: 0,
			isDefaultBranch: false,
		});

		expect(state.canCreatePR).toBe(false);
		expect(state.createPRBlockedReason).toContain("Publish this branch");
	});

	test("blocks create when branch is out of sync", () => {
		const state = getPRActionState({
			hasRepo: true,
			hasExistingPR: false,
			hasUpstream: true,
			pushCount: 0,
			pullCount: 2,
			isDefaultBranch: false,
		});

		expect(state.canCreatePR).toBe(false);
		expect(state.createPRBlockedReason).toContain("Sync this branch");
	});

	test("blocks create on default branch", () => {
		const state = getPRActionState({
			hasRepo: true,
			hasExistingPR: false,
			hasUpstream: true,
			pushCount: 0,
			pullCount: 0,
			isDefaultBranch: true,
		});

		expect(state.canCreatePR).toBe(false);
		expect(state.createPRBlockedReason).toContain("default branch");
	});
});
