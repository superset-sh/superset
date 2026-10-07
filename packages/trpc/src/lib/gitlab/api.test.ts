import { expect, test } from "bun:test";
import { gitlabApiFetch, gitlabPaginated, gitlabProjectsForScope } from "./api";

test("API rejects credential parameters before transport in query, form and JSON", async () => {
	let requests = 0;
	const send = async () => {
		requests++;
		return Response.json({});
	};
	for (const key of [
		"private_token",
		"access_token",
		"job_token",
		"bearer_token",
		"sudo",
	]) {
		for (const path of [
			`/user?${key}=SECOND_FIXTURE_TOKEN`,
			`/user?${key}%5Bvalue%5D=SECOND_FIXTURE_TOKEN`,
			`/user?${key}=&${key}=SECOND_FIXTURE_TOKEN`,
		])
			await expect(
				gitlabApiFetch(
					"https://git.public",
					"SELECTED_FIXTURE_TOKEN",
					path,
					{},
					send,
				),
			).rejects.toThrow("credential parameter");
		for (const init of [
			{
				method: "POST",
				body: new URLSearchParams({ [key]: "SECOND_FIXTURE_TOKEN" }),
			},
			{
				method: "POST",
				body: `${key}=SECOND_FIXTURE_TOKEN`,
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			},
			{ method: "POST", body: `${key}=SECOND_FIXTURE_TOKEN` },
			{
				method: "POST",
				body: JSON.stringify({ [key]: "SECOND_FIXTURE_TOKEN" }),
				headers: { "Content-Type": "application/json" },
			},
			{
				method: "POST",
				body: JSON.stringify({ [key]: "SECOND_FIXTURE_TOKEN" }),
			},
		])
			await expect(
				gitlabApiFetch(
					"https://git.public",
					"SELECTED_FIXTURE_TOKEN",
					"/projects",
					init,
					send,
				),
			).rejects.toThrow("credential parameter");
	}
	expect(requests).toBe(0);
});

test("API preserves ordinary filters and bodies while stripping alternate credential headers", async () => {
	const bodies = [
		new URLSearchParams({ title: "token", body: "private_token=example" }),
		"title=token&body=private_token%3Dexample",
		JSON.stringify({
			title: "token",
			variables: { token: "business value", private_token: "nested value" },
		}),
	];
	for (const body of bodies) {
		await gitlabApiFetch(
			"https://git.public:8443",
			"SELECTED_FIXTURE_TOKEN",
			"/projects?search=private_token%3Dexample",
			{
				method: "POST",
				body,
				headers: {
					"Deploy-Token": "DEPLOY_FIXTURE_TOKEN",
					Private_Token: "PRIVATE_FIXTURE_TOKEN",
					Job_Token: "JOB_FIXTURE_TOKEN",
					"X-Gitlab-Static-Object-Token": "STATIC_FIXTURE_TOKEN",
					"Gitlab-Agent-Api-Request": "AGENT_FIXTURE_TOKEN",
					"Gitlab-Kas-Api-Request": "KAS_FIXTURE_TOKEN",
					Sudo: "SECOND_FIXTURE_ACCOUNT",
					"X-Request-ID": "ordinary",
				},
			},
			async (url, init) => {
				expect(String(url)).toBe(
					"https://git.public:8443/api/v4/projects?search=private_token%3Dexample",
				);
				expect(init?.body).toBe(body);
				const headers = new Headers(init?.headers);
				expect(headers.get("Authorization")).toBe(
					"Bearer SELECTED_FIXTURE_TOKEN",
				);
				expect([...headers.keys()].sort()).toEqual([
					"accept",
					"authorization",
					"x-request-id",
				]);
				return Response.json({});
			},
		);
	}
});

test("API preserves webhook create and update shared-secret token payloads", async () => {
	for (const [path, method] of [
		["/projects/9/hooks", "POST"],
		["/projects/9/hooks/3", "PUT"],
	]) {
		const body = JSON.stringify({
			url: "https://webhook.fixture.test",
			token: "WEBHOOK_FIXTURE_SHARED_SECRET",
		});
		await gitlabApiFetch(
			"https://git.public",
			"SELECTED_FIXTURE_TOKEN",
			path ?? "",
			{ method, body, headers: { "Content-Type": "application/json" } },
			async (_url, init) => {
				expect(init?.body).toBe(body);
				expect(new Headers(init?.headers).get("Authorization")).toBe(
					"Bearer SELECTED_FIXTURE_TOKEN",
				);
				return Response.json({ id: 3 });
			},
		);
	}
});

test("API rejects credential-bearing multipart strings before transport", async () => {
	let requests = 0;
	const body =
		'--fixture\r\nContent-Disposition: form-data; name="private_token"\r\n\r\nSECOND_FIXTURE_TOKEN\r\n--fixture--\r\n';
	await expect(
		gitlabApiFetch(
			"https://git.public",
			"SELECTED_FIXTURE_TOKEN",
			"/projects",
			{
				method: "POST",
				body,
				headers: { "Content-Type": "multipart/form-data; boundary=fixture" },
			},
			async () => {
				requests++;
				return Response.json({});
			},
		),
	).rejects.toThrow("multipart");
	expect(requests).toBe(0);
});

test("declared or default form media type guards credentials even in JSON-looking bodies", async () => {
	let requests = 0;
	for (const body of [
		JSON.stringify("x=1&private_token=SECOND_FIXTURE_TOKEN&x=2"),
		JSON.stringify({ name: "x&private_token=SECOND_FIXTURE_TOKEN&x=2" }),
	]) {
		for (const headers of [
			{ "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
			{},
		]) {
			await expect(
				gitlabApiFetch(
					"https://git.public",
					"SELECTED_FIXTURE_TOKEN",
					"/projects",
					{ method: "POST", body, headers },
					async () => {
						requests++;
						return Response.json({});
					},
				),
			).rejects.toThrow("credential parameter");
		}
	}
	expect(requests).toBe(0);
});

test("declared JSON media types preserve embedded form-like business values", async () => {
	for (const contentType of [
		"application/json",
		"application/vnd.gitlab+json; charset=utf-8",
		"text/x-json",
		"application/jsonrequest",
		"application/problem+json",
	]) {
		const body = JSON.stringify({ name: "x&private_token=business value&x=2" });
		await gitlabApiFetch(
			"https://git.public",
			"SELECTED_FIXTURE_TOKEN",
			"/projects",
			{ method: "POST", body, headers: { "Content-Type": contentType } },
			async (_url, init) => {
				expect(init?.body).toBe(body);
				return Response.json({});
			},
		);
	}
});

test("pagination follows valid pages, retains filters, and supports omitted next-page headers", async () => {
	const paths: string[] = [];
	const values = await gitlabPaginated<{ id: number }>(
		"https://git.public:8443",
		"FIXTURE_ONLY_TOKEN",
		"/projects?membership=true",
		async (_origin, _token, path) => {
			paths.push(path);
			const page = new URL(`https://git.public${path}`).searchParams.get(
				"page",
			);
			return Response.json(
				page === "1"
					? Array.from({ length: 100 }, (_, id) => ({ id }))
					: [{ id: 100 }],
			);
		},
	);
	expect(values.map(({ id }) => id)).toEqual(
		Array.from({ length: 101 }, (_, id) => id),
	);
	expect(paths).toEqual([
		"/projects?membership=true&per_page=100&page=1",
		"/projects?membership=true&per_page=100&page=2",
	]);
});
test("pagination respects explicit empty terminal page header and server-directed advancing page", async () => {
	const result = await gitlabPaginated<number>(
		"https://git.public",
		"FIXTURE_ONLY_TOKEN",
		"/projects",
		async (_origin, _token, path) => {
			const page = new URL(`https://git.public${path}`).searchParams.get(
				"page",
			);
			return Response.json([Number(page)], {
				headers: { "x-next-page": page === "1" ? "3" : "" },
			});
		},
	);
	expect(result).toEqual([1, 3]);
});
test("malformed, duplicate and non-advancing pagination headers fail closed", async () => {
	for (const next of [
		"0",
		"1",
		"-1",
		"NaN",
		"2.5",
		"2e0",
		"0x2",
		"+2",
		" 2",
		"2, 3",
		"9007199254740992",
	])
		await expect(
			gitlabPaginated(
				"https://git.public",
				"FIXTURE_ONLY_TOKEN",
				"/projects",
				async () => Response.json([], { headers: { "x-next-page": next } }),
			),
		).rejects.toThrow("pagination");
});
test("malformed list payload, transport and authentication failures are surfaced", async () => {
	await expect(
		gitlabPaginated(
			"https://git.public",
			"FIXTURE_ONLY_TOKEN",
			"/projects",
			async () => Response.json({ items: [] }),
		),
	).rejects.toThrow("list response");
	await expect(
		gitlabPaginated(
			"https://git.public",
			"FIXTURE_ONLY_TOKEN",
			"/projects",
			async () => new Response(null, { status: 401 }),
		),
	).rejects.toMatchObject({ status: 401 });
	await expect(
		gitlabPaginated(
			"https://git.public",
			"FIXTURE_ONLY_TOKEN",
			"/projects",
			async () => {
				throw new Error("Fixture unavailable");
			},
		),
	).rejects.toThrow("Fixture unavailable");
});
test("API paths must remain under api/v4 including encoded traversal and absolute URLs", async () => {
	for (const path of [
		"https://other.public/projects",
		"//other.public/projects",
		"/../oauth/token",
		"/projects/../../oauth/token",
		"/projects/%2e%2e/user",
		"/projects/%252e%252e/user",
		"/projects\\../user",
		"/projects#fragment",
	])
		await expect(
			gitlabPaginated(
				"https://git.public",
				"FIXTURE_ONLY_TOKEN",
				path,
				async () => {
					throw new Error("Invalid path sent");
				},
			),
		).rejects.toThrow("API path");
});
test("group scope lists subgroups while excluding shared or unrelated projects", async () => {
	const projects = await gitlabProjectsForScope(
		"https://git.public",
		"FIXTURE_ONLY_TOKEN",
		{ groupPath: "Acme/Team", scopeKind: "group", scopeId: "9" },
		async (_origin, _token, path) => {
			expect(path).toBe(
				"/groups/9/projects?include_subgroups=true&with_shared=false&archived=false&per_page=100&page=1",
			);
			return Response.json(
				[
					{ id: 1, path_with_namespace: "Acme/Team/one" },
					{ id: 2, path_with_namespace: "Acme/Team/sub/two" },
					{ id: 3, path_with_namespace: "Acme/Team-other/three" },
					{ id: 4, path_with_namespace: "Acme/Team/../Other/four" },
				],
				{ headers: { "x-next-page": "" } },
			);
		},
	);
	expect(projects.map(({ id }) => id)).toEqual([1, 2]);
});
test("project scope retrieves exactly one project and verifies response scope and ID", async () => {
	const scope = { groupPath: "Acme/widget", scopeKind: "project" as const };
	expect(
		await gitlabProjectsForScope(
			"https://git.public",
			"FIXTURE_ONLY_TOKEN",
			scope,
			async (_origin, _token, path) => {
				expect(path).toBe("/projects/Acme%2Fwidget");
				return Response.json({ id: 9, path_with_namespace: "Acme/widget" });
			},
		),
	).toEqual([{ id: 9, path_with_namespace: "Acme/widget" }]);
	for (const project of [
		{ id: 9, path_with_namespace: "Other/widget" },
		{ id: 0, path_with_namespace: "Acme/widget" },
		{ id: "9", path_with_namespace: "Acme/widget" },
		{ id: 9.5, path_with_namespace: "Acme/widget" },
	])
		await expect(
			gitlabProjectsForScope(
				"https://git.public",
				"FIXTURE_ONLY_TOKEN",
				scope,
				async () => Response.json(project),
			),
		).rejects.toThrow();
});
test("encoded percent file names remain valid while recursive encoded traversal is rejected", async () => {
	const values = await gitlabPaginated<number>(
		"https://git.public",
		"FIXTURE_ONLY_TOKEN",
		"/projects/1/repository/files/100%25.txt",
		async (_origin, _token, path) => {
			expect(path).toContain("/files/100%25.txt");
			return Response.json([1], { headers: { "x-next-page": "" } });
		},
	);
	expect(values).toEqual([1]);
	await expect(
		gitlabPaginated(
			"https://git.public",
			"FIXTURE_ONLY_TOKEN",
			"/projects/%25252525252e%25252525252e/user",
			async () => {
				throw new Error("Invalid recursive path sent");
			},
		),
	).rejects.toThrow("API path");
});
test("advancing pagination cannot produce an unlimited request stream", async () => {
	let pages = 0;
	await expect(
		gitlabPaginated(
			"https://git.public",
			"FIXTURE_ONLY_TOKEN",
			"/projects",
			async (_origin, _token, path) => {
				pages++;
				const page = Number(
					new URL(`https://git.public${path}`).searchParams.get("page"),
				);
				return Response.json([], {
					headers: { "x-next-page": String(page + 1) },
				});
			},
		),
	).rejects.toThrow("pagination");
	expect(pages).toBe(1000);
});
