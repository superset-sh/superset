import { describe, expect, test } from "bun:test";
import {
	selectCloudEnvironment,
	startableCloudEnvironments,
} from "./cloud-environments";

const withRepos = (id: string, name: string) => ({
	id,
	name,
	repositories: [{}],
});
const kiet = withRepos(
	"11111111-1111-4111-8111-111111111111",
	"Kiet's Superset",
);
const satya = withRepos("22222222-2222-4222-8222-222222222222", "Superset");
const empty = {
	id: "33333333-3333-4333-8333-333333333333",
	name: "Empty",
	repositories: [],
};
const gitlab = {
	id: "44444444-4444-4444-8444-444444444444",
	name: "GitLab",
	repositories: [],
	gitlabProject: {
		cloneUrl: "https://git.example/Group/Sub/Repo.git",
		pathWithNamespace: "Group/Sub/Repo",
	},
};

describe("selectCloudEnvironment", () => {
	test("finds an environment by id", () => {
		expect(selectCloudEnvironment([kiet, satya], satya.id)).toBe(satya);
	});

	test("does not match a name", () => {
		expect(selectCloudEnvironment([kiet, satya], "Superset")).toBeUndefined();
		expect(selectCloudEnvironment([kiet, satya], "superset")).toBeUndefined();
	});

	test("nothing requested takes the only environment with repositories", () => {
		expect(selectCloudEnvironment([empty, kiet], undefined)).toBe(kiet);
	});

	test("nothing requested picks none among several", () => {
		expect(selectCloudEnvironment([kiet, satya], undefined)).toBeUndefined();
	});

	test("a sole GitLab project is startable without GitHub repositories", () => {
		expect(selectCloudEnvironment([empty, gitlab], undefined)).toBe(gitlab);
	});

	test("does not guess between GitHub and GitLab environments", () => {
		expect(selectCloudEnvironment([kiet, gitlab], undefined)).toBeUndefined();
	});

	test("filters empty provider bindings and preserves the original environment objects", () => {
		const unavailable = { ...empty, gitlabProject: null };
		expect(startableCloudEnvironments([unavailable, gitlab, kiet])).toEqual([
			gitlab,
			kiet,
		]);
		expect(startableCloudEnvironments([gitlab])[0]).toBe(gitlab);
	});

	test("explicit GitLab selection still matches only the id", () => {
		expect(selectCloudEnvironment([gitlab], gitlab.id)).toBe(gitlab);
		expect(selectCloudEnvironment([gitlab], gitlab.name)).toBeUndefined();
	});
});
