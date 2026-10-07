import assert from "node:assert/strict";
import { afterEach, test as nativeTest } from "node:test";

function test(name: string, run: () => Promise<void>, timeout = 5000) {
	nativeTest(name, { timeout }, run);
}
const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { ClientRequest, IncomingMessage, ServerResponse } from "node:http";
import { createServer, request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type GitLabStreamOptions, safeGitLabStream } from "./stream-transport";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
async function fixture(
	handle: (request: IncomingMessage, response: ServerResponse) => void,
) {
	const directory = mkdtempSync(join(tmpdir(), "superset-owned-stream-tls-"));
	cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
	const certificate = join(directory, "cert.pem");
	await promisify(execFile)("openssl", [
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-keyout",
		join(directory, "key.pem"),
		"-out",
		certificate,
		"-days",
		"1",
		"-subj",
		"/CN=gitlab.stream.fixture.test",
		"-addext",
		"subjectAltName=DNS:gitlab.stream.fixture.test",
	]);
	const cert = readFileSync(certificate);
	const server = createServer(
		{ cert, key: readFileSync(join(directory, "key.pem")) },
		handle,
	);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	cleanups.push(() => {
		server.closeAllConnections();
		server.close();
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Owned TLS address missing");
	const origin = `https://gitlab.stream.fixture.test:${address.port}`;
	let resolutions = 0;
	const options: GitLabStreamOptions = {
		issuer: origin,
		timeoutMs: 5000,
		maxRequestBytes: 32 * 1024 * 1024,
		maxResponseBytes: 32 * 1024 * 1024,
		resolve: async () => {
			resolutions++;
			return [
				{ address: resolutions === 1 ? "127.0.0.1" : "127.0.0.2", family: 4 },
			];
		},
		request: (url, init, callback) =>
			request(url, { ...init, ca: cert }, callback),
	};
	return { origin, options, resolutions: () => resolutions, server };
}
const chunk = Buffer.alloc(65_536, 0xad);
const chunkCount = 416;
const totalBytes = chunk.byteLength * chunkCount;
function source(
	onPull: () => void = () => {},
	onCancel: () => void = () => {},
) {
	let sent = 0;
	return new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				onPull();
				if (sent++ === chunkCount) controller.close();
				else controller.enqueue(chunk);
			},
			cancel: onCancel,
		},
		{ highWaterMark: 0 },
	);
}
function expectedHash() {
	const hash = createHash("sha256");
	for (let index = 0; index < chunkCount; index++) hash.update(chunk);
	return hash.digest("hex");
}
async function digest(stream: ReadableStream<Uint8Array> | null) {
	if (!stream) throw new Error("Missing owned response stream");
	const reader = stream.getReader();
	const hash = createHash("sha256");
	let bytes = 0;
	try {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) return { bytes, hash: hash.digest("hex") };
			bytes += chunk.value.byteLength;
			hash.update(chunk.value);
		}
	} finally {
		reader.releaseLock();
	}
}
test("verified pinned HTTPS streams binary upload and download above 25 MiB", async () => {
	let observedHost: string | undefined;
	let observedAuth: string | undefined;
	let observedSni: string | false | undefined;
	const state = await fixture((incoming, outgoing) => {
		observedHost = incoming.headers.host;
		observedAuth = incoming.headers.authorization;
		observedSni = Reflect.get(incoming.socket, "servername");
		void (async () => {
			const hash = createHash("sha256");
			let bytes = 0;
			for await (const part of incoming) {
				bytes += part.length;
				hash.update(part);
			}
			outgoing.setHeader("x-upload-bytes", String(bytes));
			outgoing.setHeader("x-upload-hash", hash.digest("hex"));
			outgoing.setHeader("content-type", "application/octet-stream");
			for (let index = 0; index < chunkCount; index++) {
				if (!outgoing.write(chunk)) await once(outgoing, "drain");
			}
			outgoing.end();
		})().catch(() => outgoing.destroy());
	});
	const response = await safeGitLabStream(
		`${state.origin}/selected.git/git-receive-pack`,
		{
			method: "POST",
			body: source(),
			headers: { Authorization: "Bearer OWNED_FAKE_TOKEN" },
		},
		{ ...state.options, contentLength: totalBytes },
	);
	assert.equal(response.headers.get("x-upload-bytes"), String(totalBytes));
	assert.equal(response.headers.get("x-upload-hash"), expectedHash());
	assert.deepEqual(await digest(response.body), {
		bytes: totalBytes,
		hash: expectedHash(),
	});
	assert.equal(observedHost, new URL(state.origin).host);
	assert.equal(observedSni, "gitlab.stream.fixture.test");
	assert.equal(observedAuth, "Bearer OWNED_FAKE_TOKEN");
	assert.equal(state.resolutions(), 1);
}, 15_000);
test("unconsumed responses apply backpressure and cancellation closes the TLS leg", async () => {
	let sent = 0;
	let closed = false;
	const state = await fixture((_incoming, outgoing) => {
		outgoing.on("close", () => {
			closed = true;
		});
		void (async () => {
			for (; sent < chunkCount; sent++) {
				if (!outgoing.write(chunk)) await once(outgoing, "drain");
			}
			outgoing.end();
		})().catch(() => {});
	});
	const response = await safeGitLabStream(
		`${state.origin}/download`,
		{},
		state.options,
	);
	await sleep(50);
	assert.ok(
		sent < chunkCount,
		`Producer sent ${sent} chunks without a consumer`,
	);
	await response.body?.cancel();
	for (let index = 0; index < 100 && !closed; index++) await sleep(5);
	assert.equal(closed, true);
});
test("request budgets, declared lengths and source failures abort without exposing payloads", async () => {
	let cancelled = false;
	const state = await fixture((incoming, outgoing) => {
		incoming.resume();
		incoming.on("end", () => outgoing.end("owned"));
	});
	await assert.rejects(
		safeGitLabStream(
			`${state.origin}/upload?private=FAKE_QUERY_SECRET`,
			{
				method: "POST",
				body: source(
					() => {},
					() => {
						cancelled = true;
					},
				),
			},
			{ ...state.options, maxRequestBytes: 32 },
		),
		/GitLab streaming request failed/,
	);
	assert.equal(cancelled, true);
	for (const declared of [totalBytes - 1, totalBytes + 1]) {
		await assert.rejects(
			safeGitLabStream(
				`${state.origin}/upload`,
				{ method: "POST", body: source() },
				{
					...state.options,
					resolve: async () => [{ address: "127.0.0.1", family: 4 }],
					contentLength: declared,
				},
			),
			/GitLab streaming request failed/,
		);
	}
	const broken = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.error(new Error("FAKE_PRIVATE_SOURCE"));
		},
	});
	await assert.rejects(
		safeGitLabStream(
			`${state.origin}/upload`,
			{ method: "POST", body: broken },
			{
				...state.options,
				resolve: async () => [{ address: "127.0.0.1", family: 4 }],
			},
		),
		/GitLab streaming request failed/,
	);
});
test("response budget and full-body deadline reject after streaming headers", async () => {
	const state = await fixture((incoming, outgoing) => {
		outgoing.writeHead(200, { "content-type": "application/octet-stream" });
		outgoing.write(chunk);
		if (incoming.url === "/large") outgoing.end(chunk);
	});
	const large = await safeGitLabStream(
		`${state.origin}/large`,
		{},
		{ ...state.options, maxResponseBytes: 100 },
	);
	await assert.rejects(large.arrayBuffer(), /GitLab streaming request failed/);
	const slow = await safeGitLabStream(
		`${state.origin}/slow`,
		{},
		{
			...state.options,
			resolve: async () => [{ address: "127.0.0.1", family: 4 }],
			timeoutMs: 50,
		},
	);
	await assert.rejects(slow.arrayBuffer(), /GitLab streaming request failed/);
});
test("an early success response cannot hide a later incomplete upload", async () => {
	let release!: () => void;
	const blocked = new Promise<void>((resolve) => {
		release = resolve;
	});
	cleanups.push(() => release());
	let pulls = 0;
	const body = new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				if (pulls++ === 0) controller.enqueue(new Uint8Array([1]));
				else {
					await blocked;
					controller.close();
				}
			},
		},
		{ highWaterMark: 0 },
	);
	const state = await fixture((_incoming, outgoing) =>
		outgoing.end("early success"),
	);
	const response = await safeGitLabStream(
		`${state.origin}/early`,
		{ method: "POST", body },
		{
			...state.options,
			contentLength: 2,
		},
	);
	const text = response.text();
	await sleep(20);
	release();
	await assert.rejects(text, /GitLab streaming request failed/);
});
test("redirects and certificate mismatch never forward the credential to another authority", async () => {
	let requests = 0;
	const state = await fixture((_incoming, outgoing) => {
		requests++;
		outgoing.writeHead(302, { location: "https://other.fixture.test/private" });
		outgoing.end();
	});
	await assert.rejects(
		safeGitLabStream(
			`${state.origin}/redirect`,
			{
				headers: { Authorization: "Bearer OWNED_FAKE_TOKEN" },
			},
			state.options,
		),
		/GitLab streaming request failed/,
	);
	assert.equal(requests, 1);
	const wrong = state.origin.replace(
		"gitlab.stream.fixture.test",
		"wrong.stream.fixture.test",
	);
	await assert.rejects(
		safeGitLabStream(
			`${wrong}/private`,
			{},
			{
				...state.options,
				issuer: wrong,
				resolve: async () => [{ address: "127.0.0.1", family: 4 }],
			},
		),
		/GitLab streaming request failed/,
	);
	assert.equal(requests, 1);
	await assert.rejects(
		safeGitLabStream(
			`${state.origin}/private`,
			{},
			{
				...state.options,
				request,
				resolve: async () => [{ address: "127.0.0.1", family: 4 }],
			},
		),
		/GitLab streaming request failed/,
	);
	assert.equal(requests, 1);
});
test("HEAD and no-content preserve status while stripping response hop headers", async () => {
	const state = await fixture((incoming, outgoing) => {
		outgoing.setHeader("connection", "keep-alive, x-hop");
		outgoing.setHeader("x-hop", "drop");
		outgoing.setHeader("x-owned", "retain");
		outgoing.writeHead(incoming.method === "HEAD" ? 200 : 204);
		outgoing.end();
	});
	for (const method of ["HEAD", "GET"]) {
		const response = await safeGitLabStream(
			`${state.origin}/empty`,
			{ method },
			{
				...state.options,
				resolve: async () => [{ address: "127.0.0.1", family: 4 }],
			},
		);
		assert.equal(response.status, method === "HEAD" ? 200 : 204);
		assert.equal(response.body, null);
		assert.equal(response.headers.get("x-owned"), "retain");
		assert.equal(response.headers.has("x-hop"), false);
		assert.equal(response.headers.has("connection"), false);
	}
});
test("malformed credential headers fail before DNS with sanitized errors", async () => {
	let resolutions = 0;
	await assert.rejects(
		safeGitLabStream(
			"https://fixture.test/private",
			{
				headers: { Authorization: "Bearer OWNED_PRIVATE_TOKEN\ninvalid" },
			},
			{
				timeoutMs: 100,
				maxRequestBytes: 100,
				maxResponseBytes: 100,
				resolve: async () => {
					resolutions++;
					return [];
				},
			},
		),
		(error: unknown) =>
			error instanceof Error &&
			error.message === "GitLab streaming request failed",
	);
	assert.equal(resolutions, 0);
});
test("response cancellation releases a reader waiting on actual native write drain", async () => {
	let cancelled = false;
	let closed = false;
	let outgoing: ClientRequest | undefined;
	const body = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				controller.enqueue(Buffer.alloc(256 * 1024, 0x7b));
			},
			cancel() {
				cancelled = true;
			},
		},
		{ highWaterMark: 0 },
	);
	const state = await fixture((incoming, response) => {
		incoming.pause();
		response.writeHead(200);
		response.write("early");
	});
	const send = state.options.request;
	if (!send) throw new Error("Owned native request missing");
	const response = await safeGitLabStream(
		`${state.origin}/blocked-upload`,
		{ method: "POST", body },
		{
			...state.options,
			maxRequestBytes: 512 * 1024 * 1024,
			request: (url, init, callback) => {
				outgoing = send(url, init, callback);
				outgoing.on("close", () => {
					closed = true;
				});
				return outgoing;
			},
		},
	);
	for (let index = 0; index < 1000 && !outgoing?.writableNeedDrain; index++)
		await sleep(1);
	assert.equal(outgoing?.writableNeedDrain, true);
	await response.body?.cancel();
	for (let index = 0; index < 1000 && (body.locked || !closed); index++)
		await sleep(1);
	assert.equal(cancelled, true);
	assert.equal(closed, true);
	assert.equal(body.locked, false);
});
test("discarded 205 bytes cannot bypass the response budget", async () => {
	const state = await fixture((_incoming, outgoing) => {
		outgoing.writeHead(205, { "content-length": "65536" });
		outgoing.end(chunk);
	});
	await assert.rejects(
		safeGitLabStream(
			`${state.origin}/reset`,
			{},
			{
				...state.options,
				maxResponseBytes: 1,
			},
		),
		/GitLab streaming request failed/,
	);
});
