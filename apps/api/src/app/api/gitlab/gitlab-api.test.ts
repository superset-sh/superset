import { expect, test } from "bun:test";
import {
	connectFailureCode,
	type gitlabFetch,
	gitlabWebhookUrl,
	hookProjectIds,
	identifyToken,
	registerProjectHook,
} from "./gitlab-api";

const origin = "https://git.example.invalid:8443";
const token = "FAKE_ACCESS";
const account = { id: 17, username: "tester" };
test("identifies the exact project on the selected origin and retains canonical metadata", async () => {
	const paths: string[] = [];
	const result = await identifyToken({
		origin,
		token,
		groupPath: " /team/sub/widget/ ",
		send: async (host, selected, path) => {
			expect(host).toBe(origin);
			expect(selected).toBe(token);
			paths.push(path);
			return Response.json(
				path === "/user"
					? account
					: { id: 29, path_with_namespace: "team/sub/widget" },
			);
		},
	});
	expect(paths).toEqual(["/user", "/projects/team%2Fsub%2Fwidget"]);
	expect(result).toEqual({
		userId: "17",
		username: "tester",
		project: { id: "29", pathWithNamespace: "team/sub/widget" },
		groupId: null,
		groupPath: "team/sub/widget",
	});
});
test("only a missing project falls back to a group; group path is exact", async () => {
	const paths: string[] = [];
	expect(
		await identifyToken({
			origin,
			token,
			groupPath: "team/sub",
			send: async (_host, _token, path) => {
				paths.push(path);
				return path === "/user"
					? Response.json(account)
					: path.startsWith("/projects/")
						? new Response(null, { status: 404 })
						: Response.json({ id: 31, full_path: "team/sub" });
			},
		}),
	).toMatchObject({ groupId: "31", project: null, groupPath: "team/sub" });
	expect(paths).toEqual([
		"/user",
		"/projects/team%2Fsub",
		"/groups/team%2Fsub",
	]);
	for (const status of [401, 403, 429, 500]) {
		let calls = 0;
		await expect(
			identifyToken({
				origin,
				token,
				groupPath: "team/sub",
				send: async () =>
					++calls === 1
						? Response.json(account)
						: new Response(null, { status }),
			}),
		).rejects.toThrow();
		expect(calls).toBe(2);
	}
});
test("invalid input is rejected before the credential is sent", async () => {
	let calls = 0;
	const send: typeof gitlabFetch = async () => {
		calls++;
		return Response.json(account);
	};
	for (const path of [
		null,
		"",
		"team/../other",
		"team/%2e%2e",
		"team\\other",
		"team/other?x",
		"team/other\u0000",
	]) {
		await expect(
			identifyToken({ origin, token, groupPath: path, send }),
		).rejects.toThrow();
	}
	for (const badToken of ["", "fake token", "fake\u0000", "fake😀"])
		await expect(
			identifyToken({
				origin,
				token: badToken,
				groupPath: "team/widget",
				send,
			}),
		).rejects.toThrow();
	expect(calls).toBe(0);
});
test("unusable identity or cross-scope metadata never yields a saveable account", async () => {
	for (const user of [
		{},
		{ id: 0 },
		{ id: 1.5 },
		{ id: Number.MAX_SAFE_INTEGER + 1 },
		{ id: "17" },
	])
		await expect(
			identifyToken({
				origin,
				token,
				groupPath: "team/widget",
				send: async () => Response.json(user),
			}),
		).rejects.toThrow();
	for (const project of [
		{ id: 29, path_with_namespace: "other/widget" },
		{ id: 29, path_with_namespace: "Team/widget" },
		{ id: 0, path_with_namespace: "team/widget" },
		{ id: 29, path_with_namespace: "team/widget/../x" },
	])
		await expect(
			identifyToken({
				origin,
				token,
				groupPath: "team/widget",
				send: async (_o, _t, p) =>
					Response.json(p === "/user" ? account : project),
			}),
		).rejects.toThrow();
	const error = await identifyToken({
		origin,
		token,
		groupPath: "team/widget",
		send: async () => new Response(null, { status: 401 }),
	}).catch((e) => e);
	expect(connectFailureCode(error)).toBe("token_rejected");
	expect(connectFailureCode(new Error("FAKE_PAYLOAD"))).toBe(
		"provider_unavailable",
	);
});
test("group hooks retain pagination and filter shared, malformed and sibling projects", async () => {
	const pages: string[] = [];
	const ids = await hookProjectIds({
		origin,
		token,
		identity: {
			userId: "17",
			username: "tester",
			project: null,
			groupId: "31",
			groupPath: "team/sub",
		},
		send: async (_o, _t, path) => {
			pages.push(path);
			const url = new URL(path, origin);
			expect(url.searchParams.get("include_subgroups")).toBe("true");
			expect(url.searchParams.get("with_shared")).toBe("false");
			return url.searchParams.get("page") === "1"
				? Response.json(
						[
							{ id: 29, path_with_namespace: "team/sub/widget" },
							{ id: 30, path_with_namespace: "team/submarine/widget" },
							{ id: 0, path_with_namespace: "team/sub/x" },
						],
						{ headers: { "x-next-page": "2" } },
					)
				: Response.json(
						[
							{ id: 32, path_with_namespace: "team/sub/deep/widget" },
							{ id: 33, path_with_namespace: "team/sub/../other" },
							{ id: "34", path_with_namespace: "team/sub/x" },
						],
						{ headers: { "x-next-page": "" } },
					);
		},
	});
	expect(ids).toEqual(["29", "32"]);
	expect(pages.length).toBe(2);
	expect(
		await hookProjectIds({
			origin,
			token,
			identity: {
				userId: "17",
				username: "tester",
				project: { id: "29", pathWithNamespace: "team/sub/widget" },
				groupId: null,
				groupPath: "team/sub/widget",
			},
			send: async () => {
				throw new Error("unexpected lookup");
			},
		}),
	).toEqual(["29"]);
});
test("hook updates preserve exact callback, business secret and all required events", async () => {
	const hookUrl = gitlabWebhookUrl(
		"https://api.example.invalid/base",
		"connection:1",
	);
	expect(hookUrl).toBe(
		"https://api.example.invalid/api/gitlab/webhook?connection=connection%3A1",
	);
	for (const existing of [false, true]) {
		const paths: string[] = [];
		await registerProjectHook({
			origin,
			token,
			projectId: "29",
			hookUrl,
			secret: "FAKE_HOOK_SECRET",
			send: async (_o, _t, path, init) => {
				paths.push(path);
				if (!init?.method)
					return Response.json(
						existing
							? [
									{ id: 53, url: hookUrl },
									{ id: 54, url: "https://foreign.invalid/hook" },
								]
							: [],
						{ headers: { "x-next-page": "" } },
					);
				expect(init.method).toBe(existing ? "PUT" : "POST");
				expect(JSON.parse(String(init.body))).toEqual({
					url: hookUrl,
					token: "FAKE_HOOK_SECRET",
					enable_ssl_verification: true,
					merge_requests_events: true,
					note_events: true,
					pipeline_events: true,
					issues_events: true,
					push_events: true,
				});
				return Response.json({ id: 53 });
			},
		});
		expect(paths[1]).toBe(`/projects/29/hooks${existing ? "/53" : ""}`);
	}
	await expect(
		registerProjectHook({
			origin,
			token,
			projectId: "29",
			hookUrl,
			secret: "FAKE_HOOK_SECRET",
			send: async (_o, _t, _p, init) =>
				init?.method
					? new Response("FAKE_PRIVATE", { status: 403 })
					: Response.json([], { headers: { "x-next-page": "" } }),
		}),
	).rejects.toThrow("register");
});

test("project and group connection feedback distinguish missing scope, rejected auth and unavailable upstream", async () => {
	for (const group of [false, true])
		for (const status of [401, 403, 404, 429, 503]) {
			const error = await identifyToken({
				origin,
				token,
				groupPath: "team/widget",
				send: async (_o, _t, path) =>
					path === "/user"
						? Response.json(account)
						: group && path.startsWith("/projects/")
							? new Response(null, { status: 404 })
							: new Response("FAKE_PRIVATE", { status }),
			}).catch((e) => e);
			expect(connectFailureCode(error)).toBe(
				[401, 403].includes(status)
					? "token_rejected"
					: status === 404
						? "path_not_found"
						: "provider_unavailable",
			);
		}
	const error = await identifyToken({
		origin,
		token,
		groupPath: "team/widget",
		send: async () => {
			throw Error("FAKE_TRANSPORT");
		},
	}).catch((e) => e);
	expect(connectFailureCode(error)).toBe("provider_unavailable");
});
