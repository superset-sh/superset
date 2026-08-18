import { describe, expect, it } from "bun:test";
import {
	deriveTagFromSectionName,
	planSectionTagMigrations,
} from "./planSectionTagMigrations";

describe("deriveTagFromSectionName", () => {
	it("slugs names into CLI-typeable tags", () => {
		expect(deriveTagFromSectionName("Test Fleet")).toBe("test-fleet");
		expect(deriveTagFromSectionName("  API_v2 (staging) ")).toBe(
			"api-v2-staging",
		);
		expect(deriveTagFromSectionName("perf")).toBe("perf");
	});

	it("falls back for names that slug to nothing", () => {
		expect(deriveTagFromSectionName("🚀🚀")).toBe("group");
		expect(deriveTagFromSectionName("   ")).toBe("group");
	});

	it("caps at the host's 64-char tag limit", () => {
		expect(deriveTagFromSectionName("x".repeat(200)).length).toBe(64);
	});
});

describe("planSectionTagMigrations", () => {
	const section = (over: Record<string, unknown> = {}) => ({
		id: "s1",
		projectId: "p1",
		name: "Backend",
		tagBinding: null as string | null,
		...over,
	});
	const workspace = (over: Record<string, unknown> = {}) => ({
		id: "w1",
		sectionId: "s1" as string | null,
		tags: [] as string[],
		...over,
	});

	it("tags every explicit member with the derived tag, merging existing tags", () => {
		const [step] = planSectionTagMigrations({
			sections: [section()],
			workspaces: [
				workspace({ id: "w1" }),
				workspace({ id: "w2", tags: ["perf"] }),
				workspace({ id: "elsewhere", sectionId: null }),
			],
		});
		expect(step.tag).toBe("backend");
		expect(step.members).toEqual([
			{ workspaceId: "w1", nextTags: ["backend"] },
			{ workspaceId: "w2", nextTags: ["backend", "perf"] },
		]);
	});

	it("skips already-bound sections, making reruns idempotent", () => {
		const steps = planSectionTagMigrations({
			sections: [section({ tagBinding: "backend" })],
			workspaces: [workspace()],
		});
		expect(steps).toEqual([]);
	});

	it("dedupes colliding names within a project but not across projects", () => {
		const steps = planSectionTagMigrations({
			sections: [
				section({ id: "s1", name: "Backend" }),
				section({ id: "s2", name: "backend" }),
				section({ id: "s3", name: "Backend", projectId: "p2" }),
			],
			workspaces: [],
		});
		expect(steps.map((step) => step.tag)).toEqual([
			"backend",
			"backend-2",
			"backend",
		]);
	});

	it("avoids tags already claimed by existing smart sections in the project", () => {
		const steps = planSectionTagMigrations({
			sections: [
				section({ id: "bound", tagBinding: "backend" }),
				section({ id: "manual", name: "Backend" }),
			],
			workspaces: [],
		});
		expect(steps).toHaveLength(1);
		expect(steps[0].tag).toBe("backend-2");
	});

	it("keeps a member that already carries the tag unchanged", () => {
		const [step] = planSectionTagMigrations({
			sections: [section()],
			workspaces: [workspace({ tags: ["backend"] })],
		});
		expect(step.members).toEqual([
			{ workspaceId: "w1", nextTags: ["backend"] },
		]);
	});
});
