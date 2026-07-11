/**
 * Local relay acceptance for the direct Claude Agent SDK session path.
 *
 * This deliberately drives the deployed topology instead of constructing a
 * ClaudeSessionManager in process:
 *
 *   local API auth -> allocated relay -> desktop host-service -> system Claude
 *
 * It spends real Claude tokens and writes one uniquely named file in an
 * explicitly supplied, already-registered local workspace. The file is
 * removed in `finally`; no pre-existing path is ever deleted.
 *
 * From packages/host-service (the root .env supplies allocated local URLs):
 *
 *   CLAUDE_SDK_RELAY_E2E=1 \
 *   CLAUDE_SDK_RELAY_E2E_WORKSPACE_PATH=/absolute/registered/worktree \
 *   bun --env-file=../../.env run test:e2e:claude-relay
 *
 * Optional disambiguation/overrides:
 *   CLAUDE_SDK_RELAY_E2E_ORGANIZATION_ID
 *   CLAUDE_SDK_RELAY_E2E_HOST_ID
 *   CLAUDE_SDK_RELAY_E2E_WORKSPACE_ID
 *   CLAUDE_SDK_RELAY_E2E_API_URL
 *   CLAUDE_SDK_RELAY_E2E_RELAY_URL
 *   CLAUDE_SDK_RELAY_E2E_EMAIL
 *   CLAUDE_SDK_RELAY_E2E_PASSWORD
 */
import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type {
	SDKResultMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	type PendingPermissionRequest,
	type SessionEventEnvelope,
	sessionEventEnvelopeSchema,
} from "@superset/session-protocol";
import { DEV_EMAIL, DEV_PASSWORD } from "@superset/shared/dev-credentials";
import { getHostId } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../src/trpc/router/router";

const REQUIRED_GATE = "CLAUDE_SDK_RELAY_E2E";
const WORKSPACE_PATH_ENV = "CLAUDE_SDK_RELAY_E2E_WORKSPACE_PATH";
const TURN_TIMEOUT_MS = 240_000;
const RPC_TIMEOUT_MS = 30_000;
const ADMISSION_TIMEOUT_MS = 10_000;
const STREAM_OPEN_TIMEOUT_MS = 15_000;
const FOLLOW_UP_MARKER = "RELAY_E2E_FOLLOW_UP_OK";
const WRITE_RESULT_MARKER = "RELAY_E2E_WRITE_OK";

type HostClient = ReturnType<typeof createTRPCClient<AppRouter>>;

interface JwtPayload {
	exp?: number;
	iss?: string;
	aud?: string | string[];
	organizationIds?: string[];
}

interface HarnessConfig {
	apiUrl: URL;
	relayUrl: URL;
	workspacePath: string;
	organizationIdOverride?: string;
	hostId: string;
	workspaceIdOverride?: string;
	email: string;
	password: string;
}

interface AuthResult {
	token: string;
	payload: JwtPayload;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`Missing required environment variable ${name}`);
	return value;
}

function optionalEnv(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

function localHttpUrl(value: string, name: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${name} must be a valid absolute URL`);
	}
	assert(url.protocol === "http:", `${name} must use http://`);
	assert(
		url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "[::1]" ||
			url.hostname === "::1",
		`${name} must target an explicit loopback host`,
	);
	assert(
		!url.username && !url.password,
		`${name} must not contain credentials`,
	);
	assert(
		!url.search && !url.hash,
		`${name} must not contain query or hash data`,
	);
	url.pathname = url.pathname.replace(/\/$/, "");
	return url;
}

async function loadConfig(): Promise<HarnessConfig> {
	assert(
		process.env[REQUIRED_GATE] === "1",
		`Refusing to run: set ${REQUIRED_GATE}=1 explicitly`,
	);
	const suppliedWorkspacePath = requiredEnv(WORKSPACE_PATH_ENV);
	assert(
		isAbsolute(suppliedWorkspacePath),
		`${WORKSPACE_PATH_ENV} must be absolute`,
	);
	const workspacePath = await realpath(suppliedWorkspacePath);
	const workspaceStats = await stat(workspacePath);
	assert(workspaceStats.isDirectory(), `${workspacePath} is not a directory`);
	await lstat(join(workspacePath, ".git")).catch(() => {
		throw new Error(`${workspacePath} is not a Git worktree`);
	});

	return {
		apiUrl: localHttpUrl(
			optionalEnv("CLAUDE_SDK_RELAY_E2E_API_URL") ??
				process.env.NEXT_PUBLIC_API_URL ??
				"",
			"CLAUDE_SDK_RELAY_E2E_API_URL/NEXT_PUBLIC_API_URL",
		),
		relayUrl: localHttpUrl(
			optionalEnv("CLAUDE_SDK_RELAY_E2E_RELAY_URL") ??
				process.env.RELAY_URL ??
				"",
			"CLAUDE_SDK_RELAY_E2E_RELAY_URL/RELAY_URL",
		),
		workspacePath,
		organizationIdOverride: optionalEnv("CLAUDE_SDK_RELAY_E2E_ORGANIZATION_ID"),
		hostId: optionalEnv("CLAUDE_SDK_RELAY_E2E_HOST_ID") ?? getHostId(),
		workspaceIdOverride: optionalEnv("CLAUDE_SDK_RELAY_E2E_WORKSPACE_ID"),
		email: optionalEnv("CLAUDE_SDK_RELAY_E2E_EMAIL") ?? DEV_EMAIL,
		password: optionalEnv("CLAUDE_SDK_RELAY_E2E_PASSWORD") ?? DEV_PASSWORD,
	};
}

function setCookieValues(headers: Headers): string[] {
	const extended = headers as Headers & { getSetCookie?: () => string[] };
	const values = extended.getSetCookie?.() ?? [];
	if (values.length > 0) return values;
	const combined = headers.get("set-cookie");
	return combined ? [combined] : [];
}

function cookieHeader(headers: Headers): string {
	return setCookieValues(headers)
		.map((value) => value.split(";", 1)[0]?.trim())
		.filter((value): value is string => Boolean(value))
		.join("; ");
}

function decodeJwtPayload(token: string): JwtPayload {
	const parts = token.split(".");
	assert(parts.length === 3 && parts[1], "Local API returned a malformed JWT");
	try {
		return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
	} catch {
		throw new Error("Local API returned a JWT with an invalid payload");
	}
}

async function authenticate(config: HarnessConfig): Promise<AuthResult> {
	const signInResponse = await fetch(
		new URL("/api/auth/sign-in/email", config.apiUrl),
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: config.apiUrl.origin,
			},
			body: JSON.stringify({
				email: config.email,
				password: config.password,
			}),
		},
	);
	const signInBody = (await signInResponse.json().catch(() => null)) as {
		token?: string;
		message?: string;
	} | null;
	assert(
		signInResponse.ok,
		`Local API sign-in failed (${signInResponse.status}): ${signInBody?.message ?? "unknown error"}`,
	);
	const cookies = cookieHeader(signInResponse.headers);
	const sessionToken = signInBody?.token;
	assert(
		cookies || sessionToken,
		"Local API sign-in returned neither a session cookie nor a session token",
	);

	const tokenResponse = await fetch(new URL("/api/auth/token", config.apiUrl), {
		headers: {
			...(cookies ? { cookie: cookies } : {}),
			...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
			origin: config.apiUrl.origin,
		},
	});
	const tokenBody = (await tokenResponse.json().catch(() => null)) as {
		token?: string;
		message?: string;
	} | null;
	assert(
		tokenResponse.ok && tokenBody?.token,
		`Local API JWT mint failed (${tokenResponse.status}): ${tokenBody?.message ?? "missing token"}`,
	);
	const payload = decodeJwtPayload(tokenBody.token);
	assert(
		!payload.exp || payload.exp * 1000 > Date.now() + 60_000,
		"Local API returned an expired or nearly-expired JWT",
	);
	return { token: tokenBody.token, payload };
}

function resolveOrganizationId(
	payload: JwtPayload,
	override: string | undefined,
): string {
	const organizationIds = payload.organizationIds ?? [];
	assert(
		organizationIds.length > 0,
		"Local API JWT contains no organizationIds",
	);
	if (override) {
		assert(
			organizationIds.includes(override),
			"Requested organization is not present in the local API JWT",
		);
		return override;
	}
	assert(
		organizationIds.length === 1,
		"JWT contains multiple organizations; set CLAUDE_SDK_RELAY_E2E_ORGANIZATION_ID",
	);
	const organizationId = organizationIds[0];
	assert(organizationId, "Could not resolve organization from local API JWT");
	return organizationId;
}

function createHostClient(options: {
	relayUrl: URL;
	organizationId: string;
	hostId: string;
	token: string;
}): HostClient {
	const routingKey = buildHostRoutingKey(
		options.organizationId,
		options.hostId,
	);
	const hostBase = new URL(
		`/hosts/${encodeURIComponent(routingKey)}/trpc`,
		options.relayUrl,
	);
	return createTRPCClient<AppRouter>({
		links: [
			httpLink({
				url: hostBase.toString(),
				transformer: superjson,
				headers: { authorization: `Bearer ${options.token}` },
			}),
		],
	});
}

async function resolveWorkspaceId(
	client: HostClient,
	config: HarnessConfig,
): Promise<string> {
	const rows = await withTimeout(
		client.workspace.list.query(),
		RPC_TIMEOUT_MS,
		"workspace.list through relay",
	);
	const matches: Array<{ id: string; path: string }> = [];
	for (const row of rows) {
		const rowPath = await realpath(row.worktreePath).catch(() => null);
		if (rowPath === config.workspacePath) {
			matches.push({ id: row.id, path: rowPath });
		}
	}
	if (config.workspaceIdOverride) {
		const exact = matches.find(({ id }) => id === config.workspaceIdOverride);
		assert(
			exact,
			"Workspace ID/path pair does not match a registered workspace on this host",
		);
		return exact.id;
	}
	assert(
		matches.length === 1,
		matches.length === 0
			? "No host workspace row matches the supplied real path"
			: "Multiple host workspace rows match the path; set CLAUDE_SDK_RELAY_E2E_WORKSPACE_ID",
	);
	const match = matches[0];
	assert(match, "Could not resolve the registered workspace ID");
	return match.id;
}

function streamUrl(options: {
	relayUrl: URL;
	organizationId: string;
	hostId: string;
	sessionId: string;
	token: string;
	since: number;
}): URL {
	const routingKey = buildHostRoutingKey(
		options.organizationId,
		options.hostId,
	);
	const url = new URL(
		`/hosts/${encodeURIComponent(routingKey)}/sessions/${encodeURIComponent(options.sessionId)}/stream`,
		options.relayUrl,
	);
	url.protocol = "ws:";
	url.searchParams.set("token", options.token);
	url.searchParams.set("since", String(options.since));
	return url;
}

class StreamCollector {
	readonly name: string;
	readonly envelopes: SessionEventEnvelope[] = [];
	private socket: WebSocket | null = null;
	private terminalError: Error | null = null;

	constructor(name: string) {
		this.name = name;
	}

	async open(url: URL): Promise<void> {
		assert(!this.socket, `${this.name} is already open`);
		const socket = new WebSocket(url);
		this.socket = socket;
		// Attach the data listener before awaiting `open`: a cursor replay can
		// begin immediately after the handshake and must not lose its first frame.
		socket.addEventListener("message", (event) => {
			try {
				assert(
					typeof event.data === "string",
					`${this.name} received a non-text frame`,
				);
				const parsed = sessionEventEnvelopeSchema.parse(JSON.parse(event.data));
				this.envelopes.push(parsed);
			} catch (error) {
				this.terminalError = asError(error);
			}
		});
		socket.addEventListener("error", () => {
			this.terminalError ??= new Error(`${this.name} WebSocket error`);
		});
		await withTimeout(
			new Promise<void>((resolveOpen, rejectOpen) => {
				socket.addEventListener("open", () => resolveOpen(), { once: true });
				socket.addEventListener(
					"error",
					() => rejectOpen(new Error(`${this.name} WebSocket failed to open`)),
					{ once: true },
				);
				socket.addEventListener(
					"close",
					(event) => {
						if (socket.readyState !== WebSocket.OPEN) {
							rejectOpen(
								new Error(
									`${this.name} WebSocket closed during open (${event.code})`,
								),
							);
						}
					},
					{ once: true },
				);
			}),
			STREAM_OPEN_TIMEOUT_MS,
			`${this.name} WebSocket open`,
		);
	}

	get cursor(): number {
		return this.envelopes.at(-1)?.seq ?? 0;
	}

	async waitFor(
		predicate: (envelopes: readonly SessionEventEnvelope[]) => boolean,
		label: string,
		timeoutMs = TURN_TIMEOUT_MS,
	): Promise<void> {
		await waitFor(
			() => {
				if (this.terminalError) throw this.terminalError;
				return predicate(this.envelopes);
			},
			timeoutMs,
			`${this.name}: ${label}`,
		);
	}

	async close(): Promise<void> {
		const socket = this.socket;
		this.socket = null;
		if (!socket || socket.readyState === WebSocket.CLOSED) return;
		const closed = new Promise<void>((resolveClosed) => {
			socket.addEventListener("close", () => resolveClosed(), { once: true });
		});
		socket.close(1000, "relay E2E subscriber cleanup");
		await withTimeout(closed, 5_000, `${this.name} close`).catch(() => {});
	}
}

function userMessage(content: string): SDKUserMessage {
	return {
		type: "user",
		message: { role: "user", content },
		parent_tool_use_id: null,
	};
}

function resultMessages(
	envelopes: readonly SessionEventEnvelope[],
	afterSeq: number,
): SDKResultMessage[] {
	return envelopes.flatMap(({ seq, frame }) =>
		seq > afterSeq && frame.kind === "sdk" && frame.message.type === "result"
			? [frame.message]
			: [],
	);
}

function permissionRequests(
	envelopes: readonly SessionEventEnvelope[],
	afterSeq: number,
): PendingPermissionRequest[] {
	return envelopes.flatMap(({ seq, frame }) =>
		seq > afterSeq && frame.kind === "permission_requested"
			? [frame.request]
			: [],
	);
}

async function waitForTurnEnd(
	collector: StreamCollector,
	afterSeq: number,
	label: string,
): Promise<number> {
	await collector.waitFor(
		(envelopes) => resultMessages(envelopes, afterSeq).length > 0,
		`${label} result`,
	);
	await collector.waitFor(
		(envelopes) =>
			envelopes.some(
				({ seq, frame }) =>
					seq > afterSeq &&
					frame.kind === "state" &&
					frame.state.status === "idle",
			),
		`${label} idle state`,
		30_000,
	);
	const idle = collector.envelopes.findLast(
		({ seq, frame }) =>
			seq > afterSeq && frame.kind === "state" && frame.state.status === "idle",
	);
	assert(idle, `${label} idle frame disappeared`);
	return idle.seq;
}

function assertGapless(
	envelopes: readonly SessionEventEnvelope[],
	firstSeq: number,
	lastSeq: number,
	label: string,
): void {
	const range = envelopes.filter(
		({ seq }) => seq >= firstSeq && seq <= lastSeq,
	);
	assert(
		range.length === lastSeq - firstSeq + 1,
		`${label} does not contain every sequence from ${firstSeq} through ${lastSeq}`,
	);
	for (let index = 0; index < range.length; index += 1) {
		assert(
			range[index]?.seq === firstSeq + index,
			`${label} contains a gap or duplicate at index ${index}`,
		);
		assert(
			range[index]?.frame.kind !== "reset",
			`${label} received an unexpected reset frame`,
		);
	}
}

function assertIdenticalRange(
	left: readonly SessionEventEnvelope[],
	right: readonly SessionEventEnvelope[],
	firstSeq: number,
	lastSeq: number,
	label: string,
): void {
	const select = (items: readonly SessionEventEnvelope[]) =>
		items
			.filter(({ seq }) => seq >= firstSeq && seq <= lastSeq)
			.map((envelope) => JSON.stringify(envelope));
	const leftRange = select(left);
	const rightRange = select(right);
	assert(
		JSON.stringify(leftRange) === JSON.stringify(rightRange),
		`${label} subscribers did not receive identical envelopes`,
	);
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!(await predicate())) {
		if (Date.now() >= deadline) {
			throw new Error(`${label} timed out after ${timeoutMs}ms`);
		}
		await Bun.sleep(50);
	}
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

async function pathExists(path: string): Promise<boolean> {
	return lstat(path)
		.then(() => true)
		.catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return false;
			throw error;
		});
}

async function main(): Promise<void> {
	const config = await loadConfig();
	console.log("[relay-e2e] 1/9 authenticating against the allocated local API");
	const auth = await withTimeout(
		authenticate(config),
		RPC_TIMEOUT_MS,
		"local API authentication",
	);
	const organizationId = resolveOrganizationId(
		auth.payload,
		config.organizationIdOverride,
	);
	const client = createHostClient({
		relayUrl: config.relayUrl,
		organizationId,
		hostId: config.hostId,
		token: auth.token,
	});

	console.log(
		"[relay-e2e] 2/9 resolving the exact registered workspace through the relay",
	);
	const workspaceId = await resolveWorkspaceId(client, config);
	const sessionId = randomUUID();
	const outputName = `.superset-claude-sdk-relay-e2e-${sessionId}.txt`;
	const outputPath = join(config.workspacePath, outputName);
	const expectedBytes = `superset-claude-sdk-relay-e2e:${sessionId}\n`;
	assert(
		!(await pathExists(outputPath)),
		"Refusing to use a pre-existing relay E2E output path",
	);
	// This becomes true only after the harness itself authorizes the exact
	// write. A failure before that point must never delete a path it did not
	// inject, even though the random-name collision check above passed.
	let injectedOutputPath = false;
	const collectors = new Set<StreamCollector>();
	let sessionCreated = false;

	try {
		console.log(
			"[relay-e2e] 3/9 creating a real direct-SDK session through the relay",
		);
		const created = await withTimeout(
			client.sessions.create.mutate({
				sessionId,
				workspaceId,
				model: "haiku",
				effort: "low",
				permissionMode: "default",
				title: "Superset Claude SDK relay E2E",
			}),
			RPC_TIMEOUT_MS,
			"sessions.create through relay",
		);
		sessionCreated = true;
		assert(created.harness === "claude", "Host created the wrong harness kind");
		assert(created.status === "idle", "Claude session did not become idle");
		assert(
			(await realpath(created.cwd)) === config.workspacePath,
			"Host session cwd does not match the supplied workspace",
		);

		const subscriberA = new StreamCollector("subscriber A");
		const subscriberB = new StreamCollector("subscriber B");
		collectors.add(subscriberA);
		collectors.add(subscriberB);
		console.log(
			"[relay-e2e] 4/9 opening two relay WebSocket subscribers from cursor zero",
		);
		await Promise.all([
			subscriberA.open(
				streamUrl({
					relayUrl: config.relayUrl,
					organizationId,
					hostId: config.hostId,
					sessionId,
					token: auth.token,
					since: 0,
				}),
			),
			subscriberB.open(
				streamUrl({
					relayUrl: config.relayUrl,
					organizationId,
					hostId: config.hostId,
					sessionId,
					token: auth.token,
					since: 0,
				}),
			),
		]);
		await Promise.all([
			subscriberA.waitFor((items) => items.length > 0, "initial replay"),
			subscriberB.waitFor((items) => items.length > 0, "initial replay"),
		]);

		console.log(
			"[relay-e2e] 5/9 proving admission ACK and a parked exact-write permission",
		);
		const writeMark = subscriberA.cursor;
		const writePrompt = [
			"Use the Write tool exactly once.",
			`Set file_path to exactly ${outputPath}`,
			`Set content to exactly ${JSON.stringify(expectedBytes)} (the JSON string describes the bytes; do not write quote characters).`,
			"Do not use any other tool and do not change any other file.",
			`After the write succeeds, reply with exactly ${WRITE_RESULT_MARKER}.`,
		].join("\n");
		const admittedAt = Date.now();
		const admission = await withTimeout(
			client.sessions.sendMessage.mutate({
				sessionId,
				message: userMessage(writePrompt),
			}),
			ADMISSION_TIMEOUT_MS,
			"sessions.sendMessage admission ACK",
		);
		const admissionMs = Date.now() - admittedAt;
		assert(admission.accepted, "Host did not acknowledge message admission");
		assert(
			admissionMs < ADMISSION_TIMEOUT_MS,
			"Message admission waited for turn completion",
		);
		await subscriberA.waitFor(
			(items) => permissionRequests(items, writeMark).length > 0,
			"Write permission request",
		);
		const requests = permissionRequests(subscriberA.envelopes, writeMark);
		const request = requests[0];
		assert(request, "Write permission request disappeared");
		const inputPath = request.input.file_path;
		const inputContent = request.input.content;
		const normalizedInputPath =
			typeof inputPath === "string"
				? resolve(config.workspacePath, inputPath)
				: null;
		const exactPermission =
			request.toolName === "Write" &&
			normalizedInputPath === outputPath &&
			inputContent === expectedBytes;
		if (!exactPermission) {
			await client.sessions.respondToPermission.mutate({
				sessionId,
				requestId: request.requestId,
				response: {
					behavior: "deny",
					message: "Relay E2E denied a non-exact write",
					interrupt: true,
				},
			});
			throw new Error(
				`Refused unexpected permission: tool=${request.toolName} pathMatch=${normalizedInputPath === outputPath} contentMatch=${inputContent === expectedBytes}`,
			);
		}
		const parked = await client.sessions.get.query({ sessionId });
		assert(
			parked.status === "requires_action" &&
				parked.pendingPermissions.some(
					(pending) => pending.requestId === request.requestId,
				),
			"Permission was not visibly parked while the admission RPC was complete",
		);
		const resolved = await client.sessions.respondToPermission.mutate({
			sessionId,
			requestId: request.requestId,
			response: {
				behavior: "allow",
				updatedInput: request.input,
				toolUseID: request.toolUseID,
			},
		});
		assert(
			resolved.status === "resolved",
			"Exact Write permission was not resolved",
		);
		injectedOutputPath = true;
		const writeEnd = await waitForTurnEnd(subscriberA, writeMark, "write turn");
		await subscriberB.waitFor(
			(items) => (items.at(-1)?.seq ?? 0) >= writeEnd,
			"write turn catch-up",
		);
		assert(
			permissionRequests(subscriberA.envelopes, writeMark).length === 1,
			"Write turn requested more than one permission",
		);
		assert(
			JSON.stringify(
				subscriberA.envelopes.filter(
					({ seq }) => seq > writeMark && seq <= writeEnd,
				),
			).includes(WRITE_RESULT_MARKER),
			"Write turn did not emit the expected result marker",
		);
		assertGapless(subscriberA.envelopes, 1, writeEnd, "subscriber A");
		assertGapless(subscriberB.envelopes, 1, writeEnd, "subscriber B");
		assertIdenticalRange(
			subscriberA.envelopes,
			subscriberB.envelopes,
			1,
			writeEnd,
			"initial live stream",
		);
		assert(
			(await readFile(outputPath, "utf8")) === expectedBytes,
			"Write tool did not produce the exact expected bytes",
		);

		console.log(
			"[relay-e2e] 6/9 dropping one subscriber, interrupting a long live turn, and replaying from its cursor",
		);
		const droppedCursor = writeEnd;
		await subscriberB.close();
		collectors.delete(subscriberB);
		const interruptAdmission = await withTimeout(
			client.sessions.sendMessage.mutate({
				sessionId,
				message: userMessage(
					"Do not use tools. Write the integers 1 through 100000, one per line, and do not summarize or stop early.",
				),
			}),
			ADMISSION_TIMEOUT_MS,
			"long-turn admission ACK",
		);
		assert(interruptAdmission.accepted, "Long turn was not admitted");
		await subscriberA.waitFor(
			(items) =>
				items.some(
					({ seq, frame }) =>
						seq > droppedCursor &&
						frame.kind === "sdk" &&
						frame.message.type === "stream_event",
				),
			"partial SDK message before interrupt",
		);
		await withTimeout(
			client.sessions.interrupt.mutate({ sessionId }),
			RPC_TIMEOUT_MS,
			"sessions.interrupt through relay",
		);
		const interruptedEnd = await waitForTurnEnd(
			subscriberA,
			droppedCursor,
			"interrupted turn",
		);
		const subscriberBReplay = new StreamCollector("subscriber B replay");
		collectors.add(subscriberBReplay);
		await subscriberBReplay.open(
			streamUrl({
				relayUrl: config.relayUrl,
				organizationId,
				hostId: config.hostId,
				sessionId,
				token: auth.token,
				since: droppedCursor,
			}),
		);
		await subscriberBReplay.waitFor(
			(items) => (items.at(-1)?.seq ?? 0) >= interruptedEnd,
			"cursor replay through interrupted turn",
		);
		assertGapless(
			subscriberBReplay.envelopes,
			droppedCursor + 1,
			interruptedEnd,
			"reconnected subscriber",
		);
		assertIdenticalRange(
			subscriberA.envelopes,
			subscriberBReplay.envelopes,
			droppedCursor + 1,
			interruptedEnd,
			"cursor replay",
		);

		console.log(
			"[relay-e2e] 7/9 sending a successful follow-up after interruption",
		);
		const followUpMark = interruptedEnd;
		const followUpAdmission = await withTimeout(
			client.sessions.sendMessage.mutate({
				sessionId,
				message: userMessage(
					`Do not use tools. Reply with exactly ${FOLLOW_UP_MARKER} and nothing else.`,
				),
			}),
			ADMISSION_TIMEOUT_MS,
			"follow-up admission ACK",
		);
		assert(followUpAdmission.accepted, "Follow-up turn was not admitted");
		const followUpEnd = await waitForTurnEnd(
			subscriberA,
			followUpMark,
			"follow-up turn",
		);
		await subscriberBReplay.waitFor(
			(items) => (items.at(-1)?.seq ?? 0) >= followUpEnd,
			"follow-up live catch-up",
		);
		const followUpResult = resultMessages(
			subscriberA.envelopes,
			followUpMark,
		).at(-1);
		assert(followUpResult, "Follow-up result disappeared");
		assert(!followUpResult.is_error, "Follow-up result was an SDK error");
		assert(
			JSON.stringify(followUpResult).includes(FOLLOW_UP_MARKER),
			"Follow-up result did not contain the exact marker",
		);
		assertGapless(
			subscriberA.envelopes,
			followUpMark + 1,
			followUpEnd,
			"subscriber A follow-up",
		);
		assertGapless(
			subscriberBReplay.envelopes,
			followUpMark + 1,
			followUpEnd,
			"subscriber B follow-up",
		);
		assertIdenticalRange(
			subscriberA.envelopes,
			subscriberBReplay.envelopes,
			followUpMark + 1,
			followUpEnd,
			"post-reconnect live stream",
		);

		console.log(
			"[relay-e2e] 8/9 verifying the Claude-native transcript through the relay",
		);
		await waitFor(
			async () => {
				const page = await client.sessions.getMessages.query({
					sessionId,
					limit: 200,
				});
				const serialized = JSON.stringify(page.items);
				return (
					serialized.includes(outputName) &&
					serialized.includes(WRITE_RESULT_MARKER) &&
					serialized.includes(FOLLOW_UP_MARKER)
				);
			},
			30_000,
			"Claude-native transcript flush",
		);

		console.log(
			"[relay-e2e] 9/9 all relay/session/stream/history assertions passed",
		);
		console.log(
			JSON.stringify(
				{
					ok: true,
					sessionId,
					workspaceId,
					hostId: config.hostId,
					admissionMs,
					lastSeq: followUpEnd,
				},
				null,
				2,
			),
		);
	} finally {
		for (const collector of collectors) await collector.close();
		if (sessionCreated) {
			const state = await client.sessions.get
				.query({ sessionId })
				.catch(() => null);
			if (
				state &&
				(state.status === "running" || state.status === "requires_action")
			) {
				await client.sessions.interrupt.mutate({ sessionId }).catch(() => {});
			}
		}
		if (injectedOutputPath) {
			await rm(outputPath, { force: true });
			assert(
				!(await pathExists(outputPath)),
				"Failed to remove the relay E2E-owned output file",
			);
			injectedOutputPath = false;
		}
		console.log(
			"[relay-e2e] cleanup complete (sockets closed; owned file removed)",
		);
	}
}

void main().catch((error) => {
	console.error(`[relay-e2e] FAILED: ${asError(error).message}`);
	process.exitCode = 1;
});
