import { expect, test } from "bun:test";
import {
	gitlabBranchPage,
	gitlabProjectMetadata,
	gitlabProjectPage,
} from "./cloud-options";

const credentials = {
	connectionId: "connection",
	token: "FAKE_ONLY_TOKEN",
	config: {
		host: "git.example.invalid",
		groupPath: "acme",
		scopeKind: "group" as const,
		scopeId: "17",
	},
};
const project = {
	id: 123,
	path_with_namespace: "acme/sub/app",
	http_url_to_repo: "https://git.example.invalid/acme/sub/app.git",
	default_branch: "develop",
};
test("verified project metadata retains checkout identity and default branch", () => {
	expect(gitlabProjectMetadata(credentials, project)).toEqual({
		connectionId: "connection",
		projectId: "123",
		pathWithNamespace: "acme/sub/app",
		cloneUrl: "https://git.example.invalid/acme/sub/app.git",
		defaultBranch: "develop",
	});
	expect(
		gitlabProjectMetadata(credentials, { ...project, default_branch: null })
			?.defaultBranch,
	).toBe("main");
});
test("metadata rejects invalid IDs, foreign scope and clone destinations", () => {
	for (const change of [
		{ id: -1 },
		{ id: 0 },
		{ id: 1.2 },
		{ id: Number.MAX_SAFE_INTEGER + 1 },
		{ path_with_namespace: "other/app" },
		{ path_with_namespace: "acme/../other/app" },
		{ http_url_to_repo: "https://other.invalid/acme/sub/app.git" },
		{ http_url_to_repo: "https://git.example.invalid:8443/acme/sub/app.git" },
		{
			http_url_to_repo:
				"https://user:pass@git.example.invalid/acme/sub/app.git",
		},
		{
			http_url_to_repo: "https://git.example.invalid/acme/sub/app.git?ref=main",
		},
		{ http_url_to_repo: "http://git.example.invalid/acme/sub/app.git" },
		{
			http_url_to_repo: "https://git.example.invalid/acme/sub/app/-/tree/main",
		},
		{ http_url_to_repo: "https://git.example.invalid//acme/sub/app.git" },
		{ default_branch: 7 },
	])
		expect(
			gitlabProjectMetadata(credentials, { ...project, ...change }),
		).toBeNull();
});
test("group project pages retain filters, selected account and server pagination", async () => {
	let requested = "";
	const page = await gitlabProjectPage(
		credentials,
		{ query: "app", page: 1 },
		async (origin, token, path) => {
			expect(origin).toBe("https://git.example.invalid");
			expect(token).toBe("FAKE_ONLY_TOKEN");
			requested = path;
			return Response.json(
				[project, { ...project, path_with_namespace: "other/app" }],
				{ headers: { "x-next-page": "3" } },
			);
		},
	);
	expect(requested).toBe(
		"/groups/17/projects?include_subgroups=true&with_shared=false&archived=false&order_by=path&sort=asc&per_page=50&page=1&search=app",
	);
	expect(page.items.map((p) => p.projectId)).toEqual(["123"]);
	expect(page.nextPage).toBe(3);
});
test("project scope returns only its exact repository and searches without another page request", async () => {
	const scoped = {
		...credentials,
		config: {
			...credentials.config,
			groupPath: "acme/sub/app",
			scopeKind: "project" as const,
			scopeId: "123",
		},
	};
	let count = 0;
	const send = async () => {
		count++;
		return Response.json(project);
	};
	expect(
		(await gitlabProjectPage(scoped, { page: 1, query: "missing" }, send))
			.items,
	).toEqual([]);
	expect(
		(await gitlabProjectPage(scoped, { page: 1, query: "SUB/APP" }, send))
			.items,
	).toHaveLength(1);
	expect(await gitlabProjectPage(scoped, { page: 2 }, send)).toEqual({
		items: [],
		nextPage: null,
	});
	expect(count).toBe(2);
});
test("malformed pages and pagination fail instead of silently completing", async () => {
	for (const header of ["1", "0", "2e0", "2 3", "2,3", "9007199254740992"]) {
		await expect(
			gitlabProjectPage(credentials, { page: 1 }, async () =>
				Response.json([project], { headers: { "x-next-page": header } }),
			),
		).rejects.toThrow("pagination");
	}
	await expect(
		gitlabProjectPage(credentials, { page: 1 }, async () =>
			Response.json({ items: [project] }),
		),
	).rejects.toThrow("project response");
});
test("branch pages scope the request before transport and retain default branch", async () => {
	let count = 0;
	const send = async (origin: string, token: string, path: string) => {
		count++;
		expect(origin).toBe("https://git.example.invalid");
		expect(token).toBe("FAKE_ONLY_TOKEN");
		expect(path).toBe(
			"/projects/acme%2Fsub%2Fapp/repository/branches?per_page=50&page=1&search=feat",
		);
		return Response.json([{ name: "feature" }, { name: 7 }, null]);
	};
	await expect(
		gitlabBranchPage(
			credentials,
			{ projectPath: "other/app", defaultBranch: "main", page: 1 },
			send,
		),
	).rejects.toThrow("scope");
	expect(count).toBe(0);
	expect(
		await gitlabBranchPage(
			credentials,
			{
				projectPath: "acme/sub/app",
				defaultBranch: "develop",
				page: 1,
				query: "feat",
			},
			send,
		),
	).toEqual({
		defaultBranch: "develop",
		items: [{ name: "feature" }],
		nextPage: null,
	});
});
test("transport and API failures remain failures", async () => {
	await expect(
		gitlabProjectPage(credentials, { page: 1 }, async () =>
			Response.json({}, { status: 401 }),
		),
	).rejects.toMatchObject({ status: 401 });
	await expect(
		gitlabBranchPage(
			credentials,
			{ projectPath: "acme/sub/app", defaultBranch: "main", page: 1 },
			async () => {
				throw new Error("offline");
			},
		),
	).rejects.toThrow("offline");
});
