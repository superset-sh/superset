import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough, Writable } from "node:stream";

const config = {
	issuer: "https://oidc.vercel.com/fixture",
	forwardURL: "https://broker.example/api/gitlab/proxy",
	teamId: "team_fixture",
	projectId: "project_fixture",
};
if (process.env.TEST_GITLAB_NODE_PURE === "1") {
	const { describe, expect, test } = await import("bun:test");
	globalThis.fetch = (() => {
		throw new Error("Unowned fetch forbidden");
	}) as typeof fetch;
	const { createGitlabNodeServer, parseGitlabListen } = await import(
		"./node-server"
	);
	const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
	class Output extends Writable {
		statusCode = 200;
		headersSent = false;
		headers: Record<string, string | number | readonly string[]> = {};
		chunks: Buffer[] = [];
		writeHead(status: number, headers: typeof this.headers = {}) {
			this.statusCode = status;
			this.headers = headers;
			this.headersSent = true;
			return this;
		}
		_write(chunk: Buffer, _encoding: string, callback: () => void) {
			this.chunks.push(Buffer.from(chunk));
			callback();
		}
		text() {
			return Buffer.concat(this.chunks).toString();
		}
	}
	function input(path = "/api/gitlab/proxy", method = "GET") {
		const stream = new PassThrough();
		Object.assign(stream, {
			url: path,
			method,
			rawHeaders: [
				"Host",
				"attacker.example",
				"X-Forwarded-Host",
				"other.example",
				"vercel-sandbox-oidc-token",
				"fake.jwt.value",
				"vercel-forwarded-path",
				"/api/v4/projects/17",
			],
			complete: false,
		});
		stream.once("end", () => {
			Object.assign(stream, { complete: true });
		});
		return stream as PassThrough & IncomingMessage;
	}
	function send(
		runtime: ReturnType<typeof createGitlabNodeServer>,
		request = input(),
	) {
		const response = new Output();
		runtime.server.emit(
			"request",
			request,
			response as unknown as ServerResponse,
		);
		return { request, response };
	}

	describe("standalone broker boundary without listening sockets", () => {
		test("validates explicit listen arguments instead of silently binding defaults", () => {
			expect(parseGitlabListen([])).toEqual({ host: "127.0.0.1", port: 8790 });
			expect(parseGitlabListen(["--listen", "[::1]:8080"])).toEqual({
				host: "::1",
				port: 8080,
			});
			for (const value of [
				"0.0.0.0:0",
				"localhost:65536",
				"https://host:80",
				"host:8x",
			])
				expect(() => parseGitlabListen(["--listen", value])).toThrow();
			expect(() => parseGitlabListen(["--other"])).toThrow();
		});
		test("preserves mounted path, query and provider headers using only the trusted public origin", async () => {
			let seen: Request | undefined;
			const runtime = createGitlabNodeServer({
				config,
				handler: async (request) => {
					seen = request;
					return new Response("selected");
				},
			});
			const { response } = send(
				runtime,
				input(
					"/api/gitlab/proxy/api/v4/projects/group%2Frepo?ref=feature%2Fone",
				),
			);
			await tick();
			expect(seen?.url).toBe(
				"https://broker.example/api/gitlab/proxy/api/v4/projects/group%2Frepo?ref=feature%2Fone",
			);
			expect(seen?.headers.get("vercel-sandbox-oidc-token")).toBe(
				"fake.jwt.value",
			);
			expect(response.text()).toBe("selected");
			await runtime.shutdown();
		});
		test("health is public but unsupported methods and ambiguous targets never invoke the broker", async () => {
			let calls = 0;
			const runtime = createGitlabNodeServer({
				config,
				handler: async () => {
					calls++;
					return new Response("selected");
				},
			});
			const health = send(runtime, input("/healthz"));
			await tick();
			expect(health.response.statusCode).toBe(200);
			expect(health.response.text()).toBe("ok");
			for (const path of [
				"https://evil.example/api/gitlab/proxy",
				"//evil.example",
				"/other",
				"/api/gitlab/proxy/../secret",
				"/api/gitlab/proxy/%252e%252e/secret",
				"/api/gitlab/proxy\\secret",
				"/api/gitlab/proxy#secret",
			]) {
				const { response } = send(runtime, input(path));
				await tick();
				expect(response.statusCode).toBe(404);
			}
			const unsupported = send(runtime, input(undefined, "DELETE"));
			await tick();
			expect(unsupported.response.statusCode).toBe(405);
			expect(calls).toBe(0);
			await runtime.shutdown();
		});
		test("streams a multi-chunk upload into the actual Web Request", async () => {
			let body = "";
			const runtime = createGitlabNodeServer({
				config,
				handler: async (request) => {
					body = await request.text();
					return new Response("accepted", { status: 201 });
				},
			});
			const { request, response } = send(runtime, input(undefined, "POST"));
			request.write("one");
			request.end("two");
			await tick();
			expect(body).toBe("onetwo");
			expect(response.statusCode).toBe(201);
			await runtime.shutdown();
		});
		test("keeps admission occupied until the response body completes", async () => {
			let body!: ReadableStreamDefaultController<Uint8Array>;
			const runtime = createGitlabNodeServer({
				config,
				limits: { activeRequests: 1 },
				handler: async () =>
					new Response(
						new ReadableStream({
							start(controller) {
								body = controller;
							},
						}),
					),
			});
			const first = send(runtime);
			await tick();
			const blocked = send(runtime);
			await tick();
			expect(blocked.response.statusCode).toBe(503);
			body.enqueue(new TextEncoder().encode("complete"));
			body.close();
			await tick();
			expect(first.response.text()).toBe("complete");
			const next = send(runtime);
			await tick();
			expect(next.response.statusCode).toBe(200);
			await runtime.shutdown();
		});
		test("aborts provider work on client upload abort, but completed incoming close leaves the response alive", async () => {
			let signal!: AbortSignal;
			const runtime = createGitlabNodeServer({
				config,
				handler: async (request) => {
					signal = request.signal;
					return new Promise(() => {});
				},
			});
			const first = send(runtime, input(undefined, "POST"));
			await tick();
			first.request.complete = true;
			first.request.emit("close");
			expect(signal.aborted).toBe(false);
			first.request.emit("aborted");
			expect(signal.aborted).toBe(true);
			await runtime.shutdown();
		});
		test("deadline aborts hung work, returns a private error and releases the request slot", async () => {
			let signal!: AbortSignal;
			const runtime = createGitlabNodeServer({
				config,
				limits: { activeRequests: 1, requestMs: 15 },
				handler: async (request) => {
					signal = request.signal;
					return new Promise(() => {});
				},
			});
			const first = send(runtime);
			await new Promise((resolve) => setTimeout(resolve, 35));
			expect(signal.aborted).toBe(true);
			expect(first.response.statusCode).toBe(504);
			expect(first.response.headers["cache-control"]).toBe("no-store");
			const next = send(runtime);
			await tick();
			expect(next.response.writableFinished).toBe(false);
			await runtime.shutdown();
		});
		test("does not expose thrown secrets before headers or append them after a partial response", async () => {
			const runtime = createGitlabNodeServer({
				config,
				handler: async () => {
					throw new Error("fake-private-token");
				},
			});
			const before = send(runtime);
			await tick();
			expect(before.response.statusCode).toBe(502);
			expect(before.response.text()).toBe("GitLab request failed");
			await runtime.shutdown();
			let controller!: ReadableStreamDefaultController<Uint8Array>;
			const streaming = createGitlabNodeServer({
				config,
				handler: async () =>
					new Response(
						new ReadableStream({
							start(value) {
								controller = value;
							},
						}),
					),
			});
			const partial = send(streaming);
			partial.response.on("error", () => {});
			await tick();
			controller.enqueue(new TextEncoder().encode("safe-prefix"));
			await tick();
			partial.response.destroy(new Error("fake-private-token"));
			controller.close();
			await tick();
			expect(partial.response.text()).toBe("safe-prefix");
			expect(partial.response.destroyed).toBe(true);
			await streaming.shutdown();
		});
		test("shutdown cancels active work and stops subsequent admission", async () => {
			let signal!: AbortSignal;
			const runtime = createGitlabNodeServer({
				config,
				handler: async (request) => {
					signal = request.signal;
					return new Promise(() => {});
				},
			});
			send(runtime);
			await tick();
			await runtime.shutdown();
			expect(signal.aborted).toBe(true);
			const next = send(runtime);
			await tick();
			expect(next.response.statusCode).toBe(503);
		});
		test("strips client framing and nominated hop headers without inventing provider metadata", async () => {
			let seen!: Request;
			const runtime = createGitlabNodeServer({
				config,
				handler: async (request) => {
					seen = request;
					return new Response("body", {
						headers: {
							connection: "x-private",
							"x-private": "fake-secret",
							"transfer-encoding": "chunked",
							"x-safe": "retained",
						},
					});
				},
			});
			const request = input();
			request.rawHeaders.push(
				"Connection",
				"x-untrusted",
				"X-Untrusted",
				"hidden",
				"Transfer-Encoding",
				"chunked",
			);
			Object.assign(request, { headers: { connection: "x-untrusted" } });
			const { response } = send(runtime, request);
			await tick();
			expect(seen.headers.get("host")).toBeNull();
			expect(seen.headers.get("transfer-encoding")).toBeNull();
			expect(seen.headers.get("x-untrusted")).toBeNull();
			expect(seen.headers.get("vercel-forwarded-host")).toBeNull();
			expect(response.headers["x-private"]).toBeUndefined();
			expect(response.headers["transfer-encoding"]).toBeUndefined();
			expect(response.headers["x-safe"]).toBe("retained");
			await runtime.shutdown();
		});
		test("HEAD cancels the unused response body and health HEAD emits no body", async () => {
			let cancelled = false;
			const runtime = createGitlabNodeServer({
				config,
				handler: async () =>
					new Response(
						new ReadableStream({
							cancel() {
								cancelled = true;
							},
						}),
					),
			});
			const head = send(runtime, input(undefined, "HEAD"));
			await tick();
			expect(cancelled).toBe(true);
			expect(head.response.text()).toBe("");
			expect(head.response.writableFinished).toBe(true);
			const health = send(runtime, input("/healthz", "HEAD"));
			await tick();
			expect(health.response.statusCode).toBe(200);
			expect(health.response.text()).toBe("");
			await runtime.shutdown();
		});
		test("a late handler result after deadline is cancelled rather than written", async () => {
			let resolve!: (response: Response) => void;
			let cancelled = false;
			const runtime = createGitlabNodeServer({
				config,
				limits: { requestMs: 10 },
				handler: async () =>
					new Promise((done) => {
						resolve = done;
					}),
			});
			const { response } = send(runtime);
			await new Promise((done) => setTimeout(done, 25));
			resolve(
				new Response(
					new ReadableStream({
						cancel() {
							cancelled = true;
						},
					}),
				),
			);
			await tick();
			expect(cancelled).toBe(true);
			expect(response.statusCode).toBe(504);
			expect(response.text()).toBe("GitLab request failed");
			await runtime.shutdown();
		});
		test("CLI import is unbound and invalid trusted endpoints fail before broker work", async () => {
			await import("../../gitlab-proxy");
			expect(() =>
				createGitlabNodeServer({
					config: {
						...config,
						forwardURL: "http://untrusted.example/api/gitlab/proxy",
					},
					handler: async () => new Response(),
				}),
			).toThrow();
			let seen = "";
			const root = createGitlabNodeServer({
				config: { ...config, forwardURL: "https://broker.example" },
				handler: async (request) => {
					seen = request.url;
					return new Response("root");
				},
			});
			const { response } = send(root, input("/api/v4/projects/1"));
			await tick();
			expect(seen).toBe("https://broker.example/api/v4/projects/1");
			expect(response.text()).toBe("root");
			await root.shutdown();
		});
		for (const method of ["GET", "HEAD"])
			test(`configured health mount forwards protected ${method} requests`, async () => {
				let seen: Request | undefined;
				const runtime = createGitlabNodeServer({
					config: { ...config, forwardURL: "https://broker.example/healthz" },
					handler: async (request) => {
						seen = request;
						return new Response("Forbidden", { status: 403 });
					},
				});
				const { response } = send(runtime, input("/healthz", method));
				await tick();
				expect(seen?.url).toBe("https://broker.example/healthz");
				expect(seen?.method).toBe(method);
				expect(response.statusCode).toBe(403);
				expect(response.text()).toBe(method === "HEAD" ? "" : "Forbidden");
				await runtime.shutdown();
			});
		test("HEAD completion and admission release do not wait for a hanging body cancellation", async () => {
			let cancelled = false;
			const runtime = createGitlabNodeServer({
				config,
				limits: { activeRequests: 1, requestMs: 30 },
				handler: async () =>
					new Response(
						new ReadableStream({
							cancel() {
								cancelled = true;
								return new Promise(() => {});
							},
						}),
					),
			});
			const first = send(runtime, input(undefined, "HEAD"));
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(cancelled).toBe(true);
			expect(first.response.writableFinished).toBe(true);
			expect(first.response.text()).toBe("");
			const next = send(runtime, input(undefined, "HEAD"));
			await tick();
			expect(next.response.statusCode).toBe(200);
			expect(next.response.writableFinished).toBe(true);
			await runtime.shutdown();
		});
	});
} else if (process.env.TEST_GITLAB_NODE_NATIVE === "1") {
	const { test } = await import("node:test");
	const assert = await import("node:assert/strict");
	const { request: httpRequest } = await import("node:http");
	const { once } = await import("node:events");
	globalThis.fetch = (() => {
		throw new Error("Unowned fetch forbidden");
	}) as typeof fetch;
	const { createGitlabNodeServer } = await import("./node-server");
	async function start(
		handler: (request: Request) => Promise<Response>,
		limits: Parameters<typeof createGitlabNodeServer>[0]["limits"] = {},
	) {
		const runtime = createGitlabNodeServer({ config, handler, limits });
		runtime.server.listen(0, "127.0.0.1");
		await once(runtime.server, "listening");
		const address = runtime.server.address();
		assert.ok(address && typeof address !== "string");
		return { ...runtime, port: address.port };
	}
	function exchange(
		port: number,
		path = "/api/gitlab/proxy",
		method = "GET",
		body?: Buffer,
	) {
		return new Promise<{
			status: number;
			body: Buffer;
			headers: import("node:http").IncomingHttpHeaders;
		}>((resolve, reject) => {
			const request = httpRequest(
				{
					host: "127.0.0.1",
					port,
					path,
					method,
					headers: {
						Host: "untrusted.example",
						...(body ? { "Content-Length": body.length } : {}),
					},
				},
				(response) => {
					const chunks: Buffer[] = [];
					response.on("data", (chunk) => chunks.push(chunk));
					response.on("end", () =>
						resolve({
							status: response.statusCode ?? 0,
							body: Buffer.concat(chunks),
							headers: response.headers,
						}),
					);
					response.on("error", reject);
				},
			);
			request.on("error", reject);
			request.end(body);
		});
	}
	test("native Node streams more than 25 MiB both ways without trusting Host", async () => {
		const bytes = Buffer.alloc(26 * 1024 * 1024, 0x61);
		let seen = "";
		let received = 0;
		const runtime = await start(async (request) => {
			seen = request.url;
			assert.ok(request.body);
			for await (const chunk of request.body) {
				received += chunk.length;
				assert.ok(chunk.every((value) => value === 0x61));
			}
			return new Response(bytes);
		});
		try {
			const result = await exchange(
				runtime.port,
				"/api/gitlab/proxy?mode=large",
				"POST",
				bytes,
			);
			assert.equal(result.status, 200);
			assert.equal(seen, "https://broker.example/api/gitlab/proxy?mode=large");
			assert.equal(received, 26 * 1024 * 1024);
			assert.deepEqual(result.body, bytes);
		} finally {
			await runtime.shutdown();
		}
	});
	test(
		"native Node does not shorten a 17-second upload before response headers",
		{ timeout: 25000 },
		async () => {
			const runtime = await start(
				async (request) => new Response(await request.text()),
			);
			try {
				const result = await new Promise<string>((resolve, reject) => {
					const client = httpRequest(
						{
							host: "127.0.0.1",
							port: runtime.port,
							path: "/api/gitlab/proxy",
							method: "POST",
						},
						(response) => {
							let body = "";
							response.setEncoding("utf8");
							response.on("data", (chunk) => {
								body += chunk;
							});
							response.on("end", () => resolve(body));
							response.on("error", reject);
						},
					);
					client.on("error", reject);
					client.write("slow-");
					setTimeout(() => client.end("upload"), 17000);
				});
				assert.equal(result, "slow-upload");
			} finally {
				await runtime.shutdown();
			}
		},
	);
	test("native Node aborts an incomplete upload and an interrupted download", async () => {
		let signal!: AbortSignal;
		const runtime = await start(async (request) => {
			signal = request.signal;
			await request.text();
			return new Response("done");
		});
		try {
			const client = httpRequest({
				host: "127.0.0.1",
				port: runtime.port,
				path: "/api/gitlab/proxy",
				method: "POST",
			});
			client.on("error", () => {});
			client.write("incomplete");
			while (!signal) await new Promise((resolve) => setTimeout(resolve, 5));
			client.destroy();
			await new Promise((resolve) => setTimeout(resolve, 25));
			assert.equal(signal.aborted, true);
		} finally {
			await runtime.shutdown();
		}
		let downloadSignal!: AbortSignal;
		let cancelled = false;
		const streaming = await start(async (request) => {
			downloadSignal = request.signal;
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new Uint8Array(65536));
					},
					cancel() {
						cancelled = true;
					},
				}),
			);
		});
		try {
			await new Promise<void>((resolve, reject) => {
				const client = httpRequest(
					{
						host: "127.0.0.1",
						port: streaming.port,
						path: "/api/gitlab/proxy",
					},
					(response) => {
						response.once("data", () => {
							response.destroy();
							resolve();
						});
					},
				);
				client.on("error", reject);
				client.end();
			});
			await new Promise((resolve) => setTimeout(resolve, 25));
			assert.equal(downloadSignal.aborted, true);
			assert.equal(cancelled, true);
		} finally {
			await streaming.shutdown();
		}
	});
	test("native Node body cancellation on an early denial still delivers the private response", async () => {
		const runtime = await start(async (request) => {
			await request.body?.cancel();
			return new Response("Forbidden", { status: 403 });
		});
		try {
			const result = await new Promise<{ status: number; text: string }>(
				(resolve, reject) => {
					const client = httpRequest(
						{
							host: "127.0.0.1",
							port: runtime.port,
							path: "/api/gitlab/proxy",
							method: "POST",
							headers: { "Content-Length": 1048576 },
						},
						(response) => {
							let text = "";
							response.setEncoding("utf8");
							response.on("data", (chunk) => {
								text += chunk;
							});
							response.on("end", () => {
								client.destroy();
								resolve({ status: response.statusCode ?? 0, text });
							});
							response.on("error", reject);
						},
					);
					client.on("error", reject);
					client.write(Buffer.alloc(32768));
				},
			);
			assert.equal(result.status, 403);
			assert.equal(result.text, "Forbidden");
		} finally {
			await runtime.shutdown();
		}
	});
	test("native Node never sends stream exception text after response headers", async () => {
		let controller!: ReadableStreamDefaultController<Uint8Array>;
		const runtime = await start(
			async () =>
				new Response(
					new ReadableStream({
						start(value) {
							controller = value;
							controller.enqueue(new TextEncoder().encode("safe-prefix"));
						},
					}),
				),
		);
		try {
			const bytes = await new Promise<string>((resolve, reject) => {
				const request = httpRequest(
					{ host: "127.0.0.1", port: runtime.port, path: "/api/gitlab/proxy" },
					(response) => {
						let seen = "";
						response.setEncoding("utf8");
						response.on("data", (chunk) => {
							seen += chunk;
							controller.error(new Error("fake-private-token"));
						});
						response.on("aborted", () => resolve(seen));
						response.on("error", () => resolve(seen));
						response.on("end", () => resolve(seen));
					},
				);
				request.on("error", reject);
				request.end();
			});
			assert.equal(bytes, "safe-prefix");
		} finally {
			await runtime.shutdown();
		}
	});
	test("native Node backpressure bounds production and slots remain held through output", async () => {
		let produced = 0;
		let cancelled = false;
		const runtime = await start(
			async () =>
				new Response(
					new ReadableStream({
						pull(controller) {
							produced++;
							controller.enqueue(new Uint8Array(65536));
						},
						cancel() {
							cancelled = true;
						},
					}),
				),
			{ activeRequests: 1 },
		);
		try {
			const paused = await new Promise<import("node:http").IncomingMessage>(
				(resolve, reject) => {
					const client = httpRequest(
						{
							host: "127.0.0.1",
							port: runtime.port,
							path: "/api/gitlab/proxy",
						},
						(response) => {
							response.pause();
							resolve(response);
						},
					);
					client.on("error", reject);
					client.end();
				},
			);
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.ok(produced < 256, `Unbounded output produced ${produced} chunks`);
			const overloaded = await exchange(runtime.port);
			assert.equal(overloaded.status, 503);
			paused.destroy();
			await new Promise((resolve) => setTimeout(resolve, 25));
			assert.equal(cancelled, true);
		} finally {
			await runtime.shutdown();
		}
	});
	test("native Node deadline returns constant error and shutdown cancels hung work", async () => {
		let signal!: AbortSignal;
		const runtime = await start(
			async (request) => {
				signal = request.signal;
				return new Promise(() => {});
			},
			{ requestMs: 30, shutdownMs: 50 },
		);
		try {
			const result = await exchange(runtime.port);
			assert.equal(signal.aborted, true);
			assert.equal(result.status, 504);
			assert.equal(result.body.toString(), "GitLab request failed");
			assert.equal(result.headers["cache-control"], "no-store");
		} finally {
			await runtime.shutdown();
		}
		const hanging = await start(
			async (request) => {
				signal = request.signal;
				return new Promise(() => {});
			},
			{ shutdownMs: 50 },
		);
		const client = httpRequest({
			host: "127.0.0.1",
			port: hanging.port,
			path: "/api/gitlab/proxy",
		});
		client.on("error", () => {});
		client.end();
		await new Promise((resolve) => setTimeout(resolve, 15));
		await hanging.shutdown();
		assert.equal(signal.aborted, true);
		client.destroy();
	});
	for (const method of ["GET", "HEAD"])
		test(`native configured health mount dispatches protected ${method}`, async () => {
			let calls = 0;
			const runtime = createGitlabNodeServer({
				config: { ...config, forwardURL: "https://broker.example/healthz" },
				handler: async () => {
					calls++;
					return new Response("Forbidden", { status: 403 });
				},
			});
			runtime.server.listen(0, "127.0.0.1");
			await once(runtime.server, "listening");
			const address = runtime.server.address();
			assert.ok(address && typeof address !== "string");
			try {
				const result = await exchange(address.port, "/healthz", method);
				assert.equal(calls, 1);
				assert.equal(result.status, 403);
				assert.equal(
					result.body.toString(),
					method === "HEAD" ? "" : "Forbidden",
				);
			} finally {
				await runtime.shutdown();
			}
		});
	test(
		"native HEAD finishes and admits the next request despite an indefinitely pending cancel",
		{ timeout: 1000 },
		async () => {
			let cancelled = 0;
			const runtime = await start(
				async () =>
					new Response(
						new ReadableStream({
							cancel() {
								cancelled++;
								return new Promise(() => {});
							},
						}),
					),
				{ activeRequests: 1, requestMs: 30, shutdownMs: 30 },
			);
			try {
				const first = await exchange(runtime.port, "/api/gitlab/proxy", "HEAD");
				assert.equal(first.status, 200);
				assert.equal(first.body.length, 0);
				const second = await exchange(
					runtime.port,
					"/api/gitlab/proxy",
					"HEAD",
				);
				assert.equal(second.status, 200);
				assert.equal(cancelled, 2);
			} finally {
				await runtime.shutdown();
			}
		},
	);
} else {
	const { test, expect } = await import("bun:test");
	test("invalid CLI arguments or missing configuration produce only a constant startup failure", () => {
		for (const args of [
			[],
			["--listen", "fake-secret:99999"],
			["--unknown", "fake-secret"],
		]) {
			const child = Bun.spawnSync(
				[
					process.execPath,
					"--no-env-file",
					new URL("../../gitlab-proxy.ts", import.meta.url).pathname,
					...args,
				],
				{
					env: { PATH: process.env.PATH, TMPDIR: "/tmp" },
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			expect(child.exitCode).toBe(1);
			expect(new TextDecoder().decode(child.stdout)).toBe("");
			expect(new TextDecoder().decode(child.stderr)).toBe(
				"GitLab proxy startup failed\n",
			);
		}
	});
	test("pure Node adapter fixtures run isolated with a cleared environment", () => {
		const child = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				env: {
					PATH: process.env.PATH,
					TMPDIR: "/tmp",
					TEST_GITLAB_NODE_PURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		if (child.exitCode !== 0)
			console.error(new TextDecoder().decode(child.stderr));
		expect(child.exitCode).toBe(0);
	});
}
