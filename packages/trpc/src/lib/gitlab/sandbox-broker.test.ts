import { beforeEach, expect, mock, test } from "bun:test";

if (process.env.TEST_GITLAB_BROKER_FIXTURE !== "1") {
	test("broker runs with isolated fake boundaries", async () => {
		const child = Bun.spawn(
			[process.execPath, "test", "--no-env-file", import.meta.path],
			{
				env: {
					PATH: process.env.PATH ?? "",
					TMPDIR: "/tmp",
					TEST_GITLAB_BROKER_FIXTURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [out, err, status] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (status) throw new Error(out + err);
		console.log(err.trim());
		expect(status).toBe(0);
	});
} else {
	globalThis.fetch = async () => {
		throw new Error("NETWORK_NOT_ALLOWED");
	};
	process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64");
	const config = {
		issuer: "https://oidc.vercel.com/test",
		forwardURL: "https://api.example.test/api/gitlab/proxy",
		teamId: "team_test",
		projectId: "prj_test",
	};
	const identity = {
		teamId: config.teamId,
		projectId: config.projectId,
		sandboxId: "session_test",
		sandboxName: "ws-test",
	};
	const scope = {
		organizationId: "org_test",
		workspaceId: "ws_test",
		connectionId: "conn_test",
		providerTeamId: identity.teamId,
		providerProjectId: identity.projectId,
		sandboxId: identity.sandboxId,
		sandboxName: identity.sandboxName,
		projectId: 7,
		projectPath: "Team/Widget",
		origin: "https://gl.example.test",
	};
	const initial = {
		scope,
		baseBranch: "main",
		workingBranch: "feature/test",
		fingerprint: "initial",
	};
	const credentials = {
		organizationId: scope.organizationId,
		connectionId: scope.connectionId,
		token: "FAKE_ORGANIZATION_TOKEN",
		config: {
			host: "gl.example.test",
			groupPath: "Team",
			scopeKind: "group",
			scopeId: "10",
			auth: "token",
		},
	};
	let binding = structuredClone(initial);
	let rawHost = "gl.example.test";
	let afterCredential = () => {};
	let apiResponse = () => Response.json({ ok: true });
	let afterSend = () => {};
	let streamResponse = () =>
		new Response(new Uint8Array([0, 255, 1, 2]), {
			headers: { "content-type": "application/octet-stream" },
		});
	let afterProvider = () => {};
	let loadImpl: (() => Promise<typeof binding>) | undefined;
	let credentialImpl: (() => Promise<typeof credentials>) | undefined;
	const load = mock(async () =>
		loadImpl ? loadImpl() : structuredClone(binding),
	);
	const get = mock(async () => {
		const result = credentialImpl ? await credentialImpl() : credentials;
		afterCredential();
		return result;
	});
	const project = {
		id: 7,
		path_with_namespace: "Team/Widget",
		http_url_to_repo: `${scope.origin}/Team/Widget.git`,
		default_branch: "main",
	};
	let metadata: Record<string, unknown> = structuredClone(project);
	let forkRead: ((path: string) => Response) | undefined;
	const projectApi = mock(
		async (_origin: string, _token: string, path: string) => {
			afterProvider();
			if (forkRead) return forkRead(path);
			return Response.json(
				path.includes("merge_requests") ? metadata : metadata,
			);
		},
	);
	const send = mock(
		async (_url: unknown, _init: RequestInit, _options: unknown) =>
			(() => {
				const response = apiResponse();
				afterSend();
				return response;
			})(),
	);
	const stream = mock(
		async (_url: unknown, _init: unknown, _options: unknown) =>
			streamResponse(),
	);
	const wrap = mock(
		(
			_config: unknown,
			handler: (
				r: Request,
				i: typeof identity,
				raw: unknown,
			) => Promise<Response>,
		) =>
			async (request: Request) =>
				handler(request, identity, {
					host: rawHost,
					scheme: "https",
					port: "443",
					path: new URL(request.url).pathname + new URL(request.url).search,
				}),
	);
	mock.module("./sandbox-proxy", () => ({ createGitlabSandboxProxy: wrap }));
	mock.module("./sandbox-binding", () => ({ loadGitlabSandboxBinding: load }));
	mock.module("./connection", () => ({ gitlabCredentialsFor: get }));
	mock.module("./api", () => ({
		gitlabApiFetch: projectApi,
		GitlabApiError: class extends Error {},
	}));
	mock.module("./transport", () => ({ safeGitLabFetch: send }));
	mock.module("./stream-transport", () => ({ safeGitLabStream: stream }));
	if (
		(await import("./transport")).safeGitLabFetch !== send ||
		(await import("./stream-transport")).safeGitLabStream !== stream
	)
		throw new Error("OWNED_TRANSPORT_MOCK_NOT_INSTALLED");
	const { createGitlabSandboxBroker } = await import("./sandbox-broker");
	const { rewriteGitlabLfsBatch } = await import("./lfs-actions");
	const broker = createGitlabSandboxBroker(config);
	const request = (path: string, init: RequestInit = {}) =>
		new Request(scope.origin + path, init);
	beforeEach(() => {
		binding = structuredClone(initial);
		rawHost = "gl.example.test";
		afterCredential = () => {};
		afterProvider = () => {};
		afterSend = () => {};
		loadImpl = undefined;
		credentialImpl = undefined;
		metadata = structuredClone(project);
		forkRead = undefined;
		apiResponse = () => Response.json({ ok: true });
		streamResponse = () =>
			new Response(new Uint8Array([0, 255, 1, 2]), {
				headers: { "content-type": "application/octet-stream" },
			});
		load.mockClear();
		get.mockClear();
		projectApi.mockClear();
		send.mockClear();
		stream.mockClear();
	});
	test("binds authentication configuration and canonical numeric project without caller credentials", async () => {
		const response = await broker(
			request("/api/v4/projects/Team%2FWidget/merge_requests?per_page=010", {
				headers: {
					Authorization: "Bearer caller",
					Cookie: "secret",
					Sudo: "admin",
					Host: "foreign.test",
					"Proxy-Authorization": "caller",
					Connection: "x-secret",
					"x-secret": "caller",
				},
			}),
		);
		expect(wrap.mock.calls[0]?.[0]).toEqual(config);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(get).toHaveBeenCalledWith(scope.connectionId, {
			organizationId: scope.organizationId,
			expected: { host: "gl.example.test", projectPath: scope.projectPath },
			send: expect.any(Function),
		});
		expect(send.mock.calls[0]?.[0]).toBe(
			`${scope.origin}/api/v4/projects/7/merge_requests?per_page=10`,
		);
		const headers = new Headers(send.mock.calls[0]?.[1].headers);
		expect(headers.get("authorization")).toBe(`Bearer ${credentials.token}`);
		for (const name of [
			"cookie",
			"sudo",
			"host",
			"proxy-authorization",
			"connection",
			"x-secret",
		])
			expect(headers.has(name)).toBe(false);
		expect(load).toHaveBeenCalledTimes(2);
	});
	test("returns bounded plain-text selected job traces and refuses credential echoes", async () => {
		apiResponse = () =>
			new Response("Build output\nAll done", {
				headers: { "content-type": "text/plain" },
			});
		const response = await broker(request("/api/v4/projects/7/jobs/9/trace"));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Build output\nAll done");
		apiResponse = () =>
			new Response(`trace ${credentials.token}`, {
				headers: { "content-type": "text/plain" },
			});
		expect(
			(await broker(request("/api/v4/projects/7/jobs/9/trace"))).status,
		).toBe(502);
		apiResponse = () =>
			new Response("x".repeat(1048577), {
				headers: { "content-type": "text/plain" },
			});
		expect(
			(await broker(request("/api/v4/projects/7/jobs/9/trace"))).status,
		).toBe(403);
	});
	test("fork CI and plain-text trace require the selected MR source and exact head proof", async () => {
		const head = "a".repeat(40);
		const pipeline = { project_id: 8, sha: head };
		forkRead = (path) =>
			Response.json(
				path === "/projects/7/merge_requests/9"
					? { iid: 9, target_project_id: 7, source_project_id: 8, sha: head }
					: path === "/projects/8"
						? {
								id: 8,
								path_with_namespace: "Fork/Widget",
								http_url_to_repo: `${scope.origin}/Fork/Widget.git`,
							}
						: path === "/projects/8/jobs/10"
							? { id: 10, pipeline }
							: path === "/projects/8/pipelines/11"
								? { id: 11, ...pipeline }
								: null,
			);
		apiResponse = () =>
			new Response("Fork build output", {
				headers: { "content-type": "text/html" },
			});
		const response = await broker(
			request("/api/v4/projects/8/jobs/10/trace", {
				headers: { "x-superset-gitlab-merge-request": "9" },
			}),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/plain; charset=utf-8",
		);
		expect(await response.text()).toBe("Fork build output");
		expect(get).toHaveBeenCalledWith(scope.connectionId, {
			organizationId: scope.organizationId,
			expected: { host: "gl.example.test", projectPath: "Team/Widget" },
			send: expect.any(Function),
		});
		expect(
			new Headers(send.mock.calls.at(-1)?.[1].headers).has(
				"x-superset-gitlab-merge-request",
			),
		).toBe(false);
		pipeline.sha = "b".repeat(40);
		send.mockClear();
		expect(
			(
				await broker(
					request("/api/v4/projects/8/jobs/10/trace", {
						headers: { "x-superset-gitlab-merge-request": "9" },
					}),
				)
			).status,
		).toBe(403);
		expect(send).not.toHaveBeenCalled();
		for (const path of [
			"/api/v4/projects/8/issues",
			"/api/v4/projects/8/merge_requests/9/merge",
			"/api/v4/projects/8/repository/branches",
		])
			expect(
				(
					await broker(
						request(path, {
							headers: { "x-superset-gitlab-merge-request": "9" },
						}),
					)
				).status,
			).toBe(403);
	});
	test("foreign hosts and unsupported paths cannot select organization credentials", async () => {
		rawHost = "foreign.test";
		expect((await broker(request("/api/v4/projects/7"))).status).toBe(403);
		rawHost = "gl.example.test";
		for (const path of [
			"/api/v4/projects/8",
			"/api/v4/projects/7/access_tokens",
			"/Other/Widget.git/info/refs?service=git-upload-pack",
			"/api/v4/projects/7?sudo=admin",
		])
			expect((await broker(request(path))).status).toBe(403);
		expect(get).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});
	test("current binding changes during credential selection cannot forward", async () => {
		afterCredential = () => {
			binding.fingerprint = "revoked";
		};
		expect((await broker(request("/api/v4/projects/7"))).status).toBe(403);
		expect(send).not.toHaveBeenCalled();
	});
	test("Git binary streams preserve protocol and compression with only selected Basic auth", async () => {
		const input = new Uint8Array([0, 255, 1, 2]);
		const req = request("/Team/Widget.git/git-upload-pack", {
			method: "POST",
			body: input,
			headers: {
				"Content-Type": "application/x-git-upload-pack-request",
				"Content-Encoding": "gzip",
				"Git-Protocol": "version=2",
				"Private-Token": "caller",
				Authorization: "caller",
			},
		});
		const response = await broker(req);
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(input);
		expect(projectApi).toHaveBeenCalledWith(
			scope.origin,
			credentials.token,
			"/projects/7",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(stream.mock.calls[0]?.[0]).toBe(
			`${scope.origin}/Team/Widget.git/git-upload-pack`,
		);
		const call = stream.mock.calls[0];
		const sent = call?.[1] as { body: ReadableStream; headers: Headers };
		expect(new Uint8Array(await new Response(sent.body).arrayBuffer())).toEqual(
			input,
		);
		expect(new Headers(sent.headers).get("git-protocol")).toBe("version=2");
		expect(new Headers(sent.headers).get("content-encoding")).toBe("gzip");
		expect(new Headers(sent.headers).get("authorization")).toBe(
			`Basic ${Buffer.from(`oauth2:${credentials.token}`).toString("base64")}`,
		);
		expect(call?.[2]).toMatchObject({
			maxRequestBytes: 1073741824,
			maxResponseBytes: 1073741824,
			timeoutMs: 900000,
		});
	});
	test("reused selected Git path and foreign MR rebase are rejected", async () => {
		metadata = { ...project, id: 8 };
		expect(
			(
				await broker(
					request("/Team/Widget.git/info/refs?service=git-upload-pack"),
				)
			).status,
		).toBe(403);
		expect(stream).not.toHaveBeenCalled();
		metadata = { ...project };
		afterProvider = () => {
			metadata = { iid: 12, source_project_id: 8, target_project_id: 7 };
		};
		expect(
			(
				await broker(
					request("/api/v4/projects/7/merge_requests/12/rebase", {
						method: "PUT",
						body: "{}",
						headers: { "Content-Type": "application/json" },
					}),
				)
			).status,
		).toBe(403);
		expect(send).not.toHaveBeenCalled();
	});
	test("approved mutation body is canonical JSON and grant is reread after project lookup", async () => {
		const response = await broker(
			request("/api/v4/projects/Team%2FWidget/merge_requests/12", {
				method: "PUT",
				body: "title=Hello&state_event=close",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			}),
		);
		expect(response.status).toBe(200);
		expect(send.mock.calls[0]?.[1]).toMatchObject({
			method: "PUT",
			body: JSON.stringify({ title: "Hello", state_event: "close" }),
		});
		expect(
			new Headers(send.mock.calls[0]?.[1].headers).get("content-type"),
		).toBe("application/json");
		expect(projectApi).toHaveBeenCalledTimes(1);
		afterProvider = () => {
			binding.fingerprint = "changed";
		};
		expect(
			(
				await broker(
					request("/api/v4/projects/7/merge_requests/12", {
						method: "PUT",
						body: "{}",
						headers: { "Content-Type": "application/json" },
					}),
				)
			).status,
		).toBe(403);
		expect(send).toHaveBeenCalledTimes(1);
	});
	test("metadata request caps reject before credentials and cancelled reads settle", async () => {
		expect(
			(
				await broker(
					request("/api/v4/projects/7/merge_requests", {
						method: "POST",
						body: "a".repeat(1048577),
						headers: { "Content-Type": "application/json" },
					}),
				)
			).status,
		).toBe(403);
		expect(get).not.toHaveBeenCalled();
		const controller = new AbortController();
		controller.abort();
		expect(
			(
				await broker(
					request("/api/v4/projects/7", { signal: controller.signal }),
				)
			).status,
		).toBe(403);
	});
	test("upstream errors and token-bearing metadata or headers cannot disclose credentials", async () => {
		apiResponse = () =>
			new Response(credentials.token, {
				status: 401,
				headers: {
					"Set-Cookie": credentials.token,
					"WWW-Authenticate": credentials.token,
				},
			});
		const response = await broker(request("/api/v4/projects/7"));
		expect(response.status).toBe(401);
		expect(await response.text()).not.toContain(credentials.token);
		expect(response.headers.has("set-cookie")).toBe(false);
		apiResponse = () => Response.json({ value: credentials.token });
		expect((await broker(request("/api/v4/projects/7"))).status).toBe(502);
		apiResponse = () =>
			Response.json(
				{ ok: true },
				{
					headers: {
						"x-next-page": "2",
						Link: `https://evil.test/?access_token=${credentials.token}`,
						"x-total": "5",
					},
				},
			);
		const page = await broker(
			request("/api/v4/projects/7/merge_requests?per_page=10"),
		);
		expect(page.headers.get("link")).toBe(
			'<https://gl.example.test/api/v4/projects/7/merge_requests?per_page=10&page=2>; rel="next"',
		);
		expect(page.headers.get("x-total")).toBe("5");
	});
	const oid = "a".repeat(64);
	const makeTicket = (
		operation: "download" | "upload",
		size = 4,
		offHost = true,
	) => {
		const target = offHost
			? "https://objects.example.test/object?signature=private"
			: scope.origin +
				"/Team/Widget.git/gitlab-lfs/objects/" +
				oid +
				(operation === "upload" ? `/${size}` : "");
		return (
			rewriteGitlabLfsBatch({
				scope,
				batch: { operation, objects: [{ oid, size }] },
				response: {
					objects: [
						{
							oid,
							size,
							actions: {
								[operation]: {
									href: target,
									header: { Authorization: "Bearer FAKE_STORAGE_AUTH" },
								},
							},
						},
					],
				},
				organizationToken: credentials.token,
				now: Math.floor(Date.now() / 1000),
			}).objects[0]?.actions?.[operation]?.href ?? ""
		);
	};
	test("batch rewrites provider secrets into stored-origin tickets and rereads grant", async () => {
		apiResponse = () =>
			Response.json({
				objects: [
					{
						oid,
						size: 4,
						actions: {
							download: {
								href: "https://objects.example.test/object?signature=private",
								header: { Authorization: "Bearer FAKE_STORAGE_AUTH" },
							},
						},
					},
				],
			});
		const response = await broker(
			request("/Team/Widget.git/info/lfs/objects/batch", {
				method: "POST",
				body: JSON.stringify({
					operation: "download",
					objects: [{ oid, size: 4 }],
				}),
				headers: { "Content-Type": "application/vnd.git-lfs+json" },
			}),
		);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain(`${scope.origin}/.superset/lfs/`);
		expect(text).not.toContain("FAKE_STORAGE_AUTH");
		expect(text).not.toContain(credentials.token);
		expect(load).toHaveBeenCalledTimes(3);
	});
	test("off-host LFS downloads use only private action headers and exact size", async () => {
		const response = await broker(
			new Request(makeTicket("download"), {
				headers: {
					Authorization: "caller",
					Cookie: "caller",
					"Private-Token": "caller",
				},
			}),
		);
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([0, 255, 1, 2]),
		);
		expect(get).not.toHaveBeenCalled();
		expect(
			new Headers(
				(stream.mock.calls[0]?.[1] as { headers: Headers }).headers,
			).get("authorization"),
		).toBe("Bearer FAKE_STORAGE_AUTH");
		expect(stream.mock.calls[0]?.[2]).toMatchObject({
			issuer: null,
			maxResponseBytes: 4,
		});
	});
	test("LFS upload supplies trusted size framing including zero and never org auth off-host", async () => {
		streamResponse = () => new Response(null, { status: 200 });
		expect(
			(
				await broker(
					new Request(makeTicket("upload"), {
						method: "PUT",
						body: new Uint8Array(4),
					}),
				)
			).status,
		).toBe(200);
		expect(stream.mock.calls[0]?.[2]).toMatchObject({
			contentLength: 4,
			maxRequestBytes: 4,
		});
		expect(
			(
				await broker(
					new Request(makeTicket("upload", 0), {
						method: "PUT",
						body: new Uint8Array(),
					}),
				)
			).status,
		).toBe(200);
		expect(stream.mock.calls[1]?.[2]).toMatchObject({
			contentLength: 0,
			maxRequestBytes: 1,
		});
		expect(get).not.toHaveBeenCalled();
	});
	test("download short, oversized and zero-size objects fail while consuming", async () => {
		for (const [size, actual] of [
			[4, 3],
			[4, 5],
			[0, 1],
		]) {
			streamResponse = () => new Response(new Uint8Array(actual));
			const response = await broker(new Request(makeTicket("download", size)));
			expect(response.status).toBe(200);
			await expect(response.arrayBuffer()).rejects.toThrow();
		}
	});
	test("open-ended LFS resume ranges validate Content-Range and exact remaining size", async () => {
		streamResponse = () =>
			new Response(new Uint8Array(2), {
				status: 206,
				headers: { "Content-Range": "bytes 2-3/4" },
			});
		const response = await broker(
			new Request(makeTicket("download"), { headers: { Range: "bytes=2-" } }),
		);
		expect(response.status).toBe(206);
		expect((await response.arrayBuffer()).byteLength).toBe(2);
		expect(
			new Headers(
				(stream.mock.calls[0]?.[1] as { headers: Headers }).headers,
			).get("range"),
		).toBe("bytes=2-");
		streamResponse = () =>
			new Response(new Uint8Array(2), {
				status: 206,
				headers: { "Content-Range": "bytes 1-2/4" },
			});
		expect(
			(
				await broker(
					new Request(makeTicket("download"), {
						headers: { Range: "bytes=2-" },
					}),
				)
			).status,
		).toBe(502);
	});
	test("LFS current scope changes reject tickets before object-store transport", async () => {
		const href = makeTicket("download");
		binding.scope = { ...scope, projectId: 8 };
		expect((await broker(new Request(href))).status).toBe(403);
		expect(stream).not.toHaveBeenCalled();
	});
	test("late credential resolution after abort cannot dispatch transport", async () => {
		let release!: (v: typeof credentials) => void;
		credentialImpl = () =>
			new Promise((resolve) => {
				release = resolve;
			});
		const controller = new AbortController();
		const pending = broker(
			request("/api/v4/projects/7", { signal: controller.signal }),
		);
		await new Promise((resolve) => setTimeout(resolve, 5));
		controller.abort();
		expect((await pending).status).toBe(403);
		release(credentials);
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(send).not.toHaveBeenCalled();
	});
	test("LFS batch and lock metadata use GitLab Basic authentication", async () => {
		for (const [path, method, body] of [
			[
				"/Team/Widget.git/info/lfs/objects/batch",
				"POST",
				JSON.stringify({ operation: "upload", objects: [{ oid, size: 4 }] }),
			],
			["/Team/Widget.git/info/lfs/locks", "GET", undefined],
		] as const) {
			apiResponse = () =>
				Response.json(
					path.endsWith("batch")
						? { objects: [{ oid, size: 4 }] }
						: { locks: [] },
				);
			expect(
				(
					await broker(
						request(path, {
							method,
							body,
							headers: { "Content-Type": "application/vnd.git-lfs+json" },
						}),
					)
				).status,
			).toBe(200);
			expect(
				new Headers(send.mock.calls.at(-1)?.[1].headers).get("authorization"),
			).toBe(
				`Basic ${Buffer.from(`oauth2:${credentials.token}`).toString("base64")}`,
			);
		}
	});
	test("same-origin LFS verify suppresses private object credentials in successful metadata", async () => {
		const href =
			rewriteGitlabLfsBatch({
				scope,
				batch: { operation: "upload", objects: [{ oid, size: 4 }] },
				response: {
					objects: [
						{
							oid,
							size: 4,
							actions: {
								upload: {
									href: `${scope.origin}/Team/Widget.git/gitlab-lfs/objects/${oid}/4`,
								},
								verify: {
									href: `${scope.origin}/Team/Widget.git/gitlab-lfs/objects/${oid}/verify`,
									header: { Authorization: "Bearer FAKE_PRIVATE_ACTION" },
								},
							},
						},
					],
				},
				organizationToken: credentials.token,
				now: Math.floor(Date.now() / 1000),
			}).objects[0]?.actions?.verify?.href ?? "";
		apiResponse = () => Response.json({ echo: "FAKE_PRIVATE_ACTION" });
		const response = await broker(
			new Request(href, {
				method: "POST",
				headers: { "Content-Type": "application/vnd.git-lfs+json" },
				body: JSON.stringify({ oid, size: 4 }),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});

	test("LFS upload completion drains upstream before discarding private response content", async () => {
		streamResponse = () =>
			new Response("FAKE_STORAGE_AUTH", {
				headers: { "content-type": "text/plain" },
			});
		const response = await broker(
			new Request(makeTicket("upload"), {
				method: "PUT",
				body: new Uint8Array(4),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("");
	});
	test("grant revocation after LFS batch response refuses ticket minting", async () => {
		apiResponse = () =>
			Response.json({
				objects: [
					{
						oid,
						size: 4,
						actions: {
							download: { href: "https://objects.example.test/object" },
						},
					},
				],
			});
		afterSend = () => {
			binding.fingerprint = "revoked";
		};
		const response = await broker(
			request("/Team/Widget.git/info/lfs/objects/batch", {
				method: "POST",
				body: JSON.stringify({
					operation: "download",
					objects: [{ oid, size: 4 }],
				}),
				headers: { "Content-Type": "application/vnd.git-lfs+json" },
			}),
		);
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain("/.superset/lfs/");
	});
	test("successful selected-project rebase has current exact MR ancestry", async () => {
		projectApi.mockImplementationOnce(async () => Response.json(project));
		projectApi.mockImplementationOnce(async () =>
			Response.json({ iid: 12, source_project_id: 7, target_project_id: 7 }),
		);
		const response = await broker(
			request("/api/v4/projects/7/merge_requests/12/rebase", {
				method: "PUT",
				body: "{}",
				headers: { "Content-Type": "application/json" },
			}),
		);
		expect(response.status).toBe(200);
		expect(projectApi).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[0]?.[0]).toBe(
			`${scope.origin}/api/v4/projects/7/merge_requests/12/rebase`,
		);
	});
	test("zero-size downloads and resumed server200 full restart preserve valid transfer", async () => {
		streamResponse = () => new Response(new Uint8Array());
		const zero = await broker(new Request(makeTicket("download", 0)));
		expect(zero.status).toBe(200);
		expect((await zero.arrayBuffer()).byteLength).toBe(0);
		streamResponse = () => new Response(new Uint8Array(4));
		const full = await broker(
			new Request(makeTicket("download"), { headers: { Range: "bytes=2-" } }),
		);
		expect(full.status).toBe(200);
		expect((await full.arrayBuffer()).byteLength).toBe(4);
	});
	test("malformed LFS resume variants reject before private transport", async () => {
		for (const range of [
			"bytes=-2",
			"bytes=1-2",
			"bytes=1-,2-",
			"bytes=4-",
			"bytes=9007199254740992-",
		]) {
			expect(
				(
					await broker(
						new Request(makeTicket("download"), { headers: { Range: range } }),
					)
				).status,
			).toBe(403);
		}
		expect(stream).not.toHaveBeenCalled();
	});
	test("parsed JSON metadata cannot expose an escaped organization token", async () => {
		const escaped = credentials.token
			.split("")
			.map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
			.join("");
		apiResponse = () =>
			new Response(`{"echo":"${escaped}"}`, {
				headers: { "Content-Type": "application/json" },
			});
		const response = await broker(request("/api/v4/projects/7"));
		expect(response.status).toBe(502);
		expect(await response.text()).not.toContain(credentials.token);
	});
	test.each([
		"git",
		"lfs",
	])("%s upload uses binary deadline after preparation, even before response headers", async (kind) => {
		const oldSet = globalThis.setTimeout,
			oldClear = globalThis.clearTimeout;
		let deadlineCallback: (() => void) | undefined,
			deadlineHandle: ReturnType<typeof setTimeout> | undefined,
			active = false;
		globalThis.setTimeout = ((
			callback: () => void,
			ms?: number,
			...args: unknown[]
		) => {
			if (ms === 15000) {
				deadlineCallback = () => callback(...args);
				active = true;
				deadlineHandle = oldSet(() => {}, 60000);
				return deadlineHandle;
			}
			return oldSet(callback, ms, ...args);
		}) as typeof setTimeout;
		globalThis.clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
			if (handle === deadlineHandle) active = false;
			oldClear(handle);
		}) as typeof clearTimeout;
		let release: ((value: Response) => void) | undefined;
		stream.mockImplementation(
			async () => new Promise((resolve) => (release = resolve)),
		);
		try {
			const req =
				kind === "git"
					? request("/Team/Widget.git/git-upload-pack", {
							method: "POST",
							body: new Uint8Array(4),
							headers: {
								"Content-Type": "application/x-git-upload-pack-request",
							},
						})
					: new Request(makeTicket("upload"), {
							method: "PUT",
							body: new Uint8Array(4),
						});
			const pending = broker(req);
			for (let i = 0; i < 100 && !release; i++) await Promise.resolve();
			expect(typeof release).toBe("function");
			if (active) deadlineCallback?.();
			release?.(
				kind === "git"
					? new Response(new Uint8Array(4))
					: new Response(null, { status: 200 }),
			);
			const response = await pending;
			expect(response.status).toBe(200);
			expect(stream.mock.calls[0]?.[2].timeoutMs).toBeGreaterThan(15000);
		} finally {
			if (deadlineHandle) oldClear(deadlineHandle);
			globalThis.setTimeout = oldSet;
			globalThis.clearTimeout = oldClear;
			stream.mockImplementation(async () => streamResponse());
		}
	});
}
