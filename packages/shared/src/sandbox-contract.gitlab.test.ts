import { expect, test } from "bun:test";
import { sandboxRepositoriesSchema } from "./sandbox-contract";

const repository = {
	url: "https://gitlab.example.test/Team/Sub/Repo.git",
	branch: "work/one",
	baseBranch: "main",
	path: ".",
	hooks: true,
};

test("claimed GitLab classification survives repository contract parsing", () => {
	const claimed = { ...repository, provider: "gitlab" as const };
	expect(sandboxRepositoriesSchema.parse([claimed])).toEqual([claimed]);
});

test("unhinted repository contract keeps existing outputs", () => {
	for (const url of [
		"https://github.com/Team/Repo.git",
		"https://old.example.test:8443/Team/Repo.git",
	]) {
		const value = { ...repository, url };
		expect(sandboxRepositoriesSchema.parse([value])).toEqual([value]);
	}
});

for (const url of [
	"https://github.com/Team/Repo.git",
	"http://gitlab.example.test/Team/Repo.git",
	"ssh://git@gitlab.example.test/Team/Repo.git",
	"https://gitlab.example.test:8443/Team/Repo.git",
	"https://user:secret@gitlab.example.test/Team/Repo.git",
	"https://gitlab.example.test/Team/Repo.git?auth=secret",
	"https://gitlab.example.test/Team/Repo.git#fragment",
	"https://gitlab.example.test/Team/Repo",
	"https://gitlab.example.test/Team/Repo.git/",
	"https://gitlab.example.test/Team//Repo.git",
	"https://gitlab.example.test/Team/./Repo.git",
	"https://gitlab.example.test/Team/..git",
	"https://gitlab.example.test/Team/...git",
	"https://gitlab.example.test/Team/%2e%2e/Repo.git",
	"https://gitlab.example.test/Team%2FSub/Repo.git",
	"https://gitlab.example.test/Team/Repo.git/-/anything",
	"https://gitlab.example.test/Team\\Repo.git",
	"https://gitlab.example.test/Team/Repo.git\n",
	"https://127.0.0.1/Team/Repo.git",
	"https://gitlab.example.test./Team/Repo.git",
])
	test(`claimed GitLab clone rejects ambiguous URL ${JSON.stringify(url)}`, () => {
		expect(
			sandboxRepositoriesSchema.safeParse([
				{ ...repository, provider: "gitlab", url },
			]).success,
		).toBe(false);
	});

test("repository contract refuses an unsupported explicit provider", () => {
	expect(
		sandboxRepositoriesSchema.safeParse([{ ...repository, provider: "other" }])
			.success,
	).toBe(false);
});
