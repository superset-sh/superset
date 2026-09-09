import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BundledSource } from "./connections";
import {
	credentialFetch,
	type PluginManifest,
	resolveTemplateDeep,
	resolveUrlTemplate,
	supersetExtension,
	type TemplateScope,
} from "./manifest";

export interface ToolDefinition {
	name: string;
	description?: string;
	inputSchema?: unknown;
	annotations?: Record<string, unknown>;
}

const REQUEST_ID = 1;

export class PluginDispatchError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

async function post(
	url: string,
	headers: Record<string, string>,
	body: unknown,
): Promise<Response> {
	return await credentialFetch(
		url,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				...headers,
			},
			body: JSON.stringify(body),
		},
		"mcp",
	);
}

async function rpc(
	url: string,
	headers: Record<string, string>,
	method: string,
	params: unknown,
): Promise<{ result: unknown; response: Response }> {
	const response = await post(url, headers, {
		jsonrpc: "2.0",
		id: REQUEST_ID,
		method,
		params,
	});

	if (response.status === 401 || response.status === 403) {
		throw new PluginDispatchError(
			`Upstream rejected the credential (${response.status}); reconnect the plugin.`,
			401,
		);
	}
	if (response.status === 404 || response.status === 400) {
		throw new PluginDispatchError(
			`Upstream returned ${response.status} ${response.statusText}`,
			response.status,
		);
	}
	if (!response.ok) {
		throw new PluginDispatchError(
			`Upstream returned ${response.status} ${response.statusText}`,
			502,
		);
	}

	const text = await response.text();
	const frames = text
		.split("\n")
		.map((line) =>
			line.startsWith("data:") ? line.slice(5).trim() : line.trim(),
		)
		.filter(Boolean);

	for (const frame of frames.reverse()) {
		let payload: {
			id?: unknown;
			result?: unknown;
			error?: { message: string };
		};
		try {
			payload = JSON.parse(frame);
		} catch {
			continue;
		}
		if (payload.id !== REQUEST_ID) continue;
		if (payload.error) {
			throw new PluginDispatchError(payload.error.message, 502);
		}
		return { result: payload.result, response };
	}

	throw new PluginDispatchError(
		"Upstream returned no JSON-RPC response for this request",
		502,
	);
}

const PROTOCOL_VERSION = "2025-06-18";

async function initialize(
	url: string,
	headers: Record<string, string>,
): Promise<Record<string, string>> {
	const { result, response } = await rpc(url, headers, "initialize", {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: {},
		clientInfo: { name: "superset", version: "1.0.0" },
	});

	const session: Record<string, string> = {
		"mcp-protocol-version":
			(result as { protocolVersion?: string } | undefined)?.protocolVersion ??
			PROTOCOL_VERSION,
	};
	const id = response.headers.get("mcp-session-id");
	if (id) session["mcp-session-id"] = id;

	await post(
		url,
		{ ...headers, ...session },
		{ jsonrpc: "2.0", method: "notifications/initialized" },
	);
	return session;
}

async function mcpCall(
	target: { url: string; headers: Record<string, string> },
	method: string,
	params: unknown,
): Promise<unknown> {
	try {
		return (await rpc(target.url, target.headers, method, params)).result;
	} catch (error) {
		const wantsSession =
			error instanceof PluginDispatchError &&
			(error.status === 400 || error.status === 404);
		if (!wantsSession) throw error;

		const session = await initialize(target.url, target.headers);
		return (
			await rpc(target.url, { ...target.headers, ...session }, method, params)
		).result;
	}
}

function remoteTarget(
	manifest: PluginManifest,
	scope: TemplateScope,
	method?: string | null,
) {
	const extension = supersetExtension(manifest);
	const mcp = extension?.mcp;
	if (!mcp?.url) return null;

	const authMethod = method
		? extension?.auth?.find((entry) => entry.type === method)
		: undefined;
	const methodBind = authMethod?.bind;

	const headers: Record<string, string> = {
		...resolveTemplateDeep(mcp.headers ?? {}, scope),
		...resolveTemplateDeep(methodBind ?? extension?.bind ?? {}, scope).headers,
	};
	return {
		url: resolveUrlTemplate(mcp.url, scope, authMethod, "mcp.url"),
		headers,
	};
}

type BundledRun = (event: {
	event: "get-tools" | "call-tool";
	eventBody: Record<string, unknown>;
	config: Record<string, unknown>;
}) => Promise<unknown> | unknown;

interface ServerRef {
	path: string;
	integrity: string;
	/** The release tag the bytes were published at, when the manifest pins one. */
	ref?: string;
}

const loaded = new Map<string, Promise<BundledRun>>();

const importAtRuntime = new Function(
	"specifier",
	"return import(specifier)",
) as (specifier: string) => Promise<{ run?: BundledRun }>;

const MAX_SERVER_BYTES = 8 * 1024 * 1024;

function serverRef(manifest: PluginManifest): ServerRef | null {
	const server = supersetExtension(manifest)?.server;
	if (!server?.path || !server.integrity) return null;
	return {
		path: server.path,
		integrity: server.integrity,
		...(server.ref ? { ref: server.ref } : {}),
	};
}

function digestOf(source: Buffer): string {
	return `sha256-${createHash("sha256").update(source).digest("base64")}`;
}

async function* streamOf(response: Response): AsyncGenerator<Buffer> {
	const reader = response.body?.getReader();
	if (!reader) return;
	while (true) {
		const { done, value } = await reader.read();
		if (done) return;
		if (value) yield Buffer.from(value);
	}
}

let serverCacheDir: string | undefined;
function cacheDir(): string {
	if (!serverCacheDir) {
		serverCacheDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "superset-plugin-servers-"),
		);
		fs.chmodSync(serverCacheDir, 0o700);
	}
	return serverCacheDir;
}

async function fetchServer(
	pluginName: string,
	source: BundledSource,
	ref: ServerRef,
): Promise<Buffer> {
	// The manifest's own ref pins the bytes to the release they were published
	// at; the marketplace's ref is a branch that has moved on since.
	const at = ref.ref ?? source.ref;
	const url = `https://raw.githubusercontent.com/${source.repo}/${at}/${ref.path}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new PluginDispatchError(
			`Could not download the server for "${pluginName}" (${response.status} from ${url}).`,
			502,
		);
	}

	const chunks: Buffer[] = [];
	let total = 0;
	const tooLarge = () =>
		new PluginDispatchError(
			`Server for "${pluginName}" is over the ${MAX_SERVER_BYTES} byte limit.`,
			502,
		);

	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_SERVER_BYTES) {
		await response.body?.cancel();
		throw tooLarge();
	}

	for await (const chunk of streamOf(response)) {
		total += chunk.byteLength;
		if (total > MAX_SERVER_BYTES) {
			await response.body?.cancel();
			throw tooLarge();
		}
		chunks.push(chunk);
	}
	const body = Buffer.concat(chunks);

	const actual = digestOf(body);
	if (actual !== ref.integrity) {
		throw new PluginDispatchError(
			`Server for "${pluginName}" does not match the published digest; refusing to run it.`,
			502,
		);
	}
	return body;
}

async function bundledRun(
	pluginName: string,
	manifest: PluginManifest,
	source: BundledSource | null,
): Promise<BundledRun> {
	const ref = serverRef(manifest);
	if (!ref) {
		throw new PluginDispatchError(
			`Plugin "${pluginName}" declares no mcp url and no published server.`,
			501,
		);
	}
	if (!source) {
		throw new PluginDispatchError(
			`Plugin "${pluginName}" came from a marketplace this server cannot reach, so its bundled server cannot be downloaded.`,
			501,
		);
	}

	const cached = loaded.get(ref.integrity);
	if (cached) return await cached;

	const load = (async () => {
		const key = Buffer.from(ref.integrity).toString("base64url");
		const dir = cacheDir();
		const file = path.join(dir, `${key}.mjs`);

		let usable = false;
		try {
			usable = digestOf(await fs.promises.readFile(file)) === ref.integrity;
		} catch {
			usable = false;
		}

		if (!usable) {
			const body = await fetchServer(pluginName, source, ref);
			const staging = `${file}.${process.pid}.partial`;
			await fs.promises.writeFile(staging, body);
			await fs.promises.rename(staging, file);
		}

		const module = await importAtRuntime(pathToFileURL(file).href);
		if (typeof module.run !== "function") {
			throw new PluginDispatchError(
				`Plugin "${pluginName}" server exports no run().`,
				500,
			);
		}
		return module.run;
	})();

	loaded.set(ref.integrity, load);
	try {
		return await load;
	} catch (error) {
		loaded.delete(ref.integrity);
		throw error;
	}
}

function bundledConfig(scope: TemplateScope): Record<string, unknown> {
	return { ...(scope.inputs ?? {}), ...(scope.config ?? {}) };
}

async function bundledDispatch(
	manifest: PluginManifest,
	scope: TemplateScope,
	source: BundledSource | null,
	event: "get-tools" | "call-tool",
	eventBody: Record<string, unknown>,
): Promise<unknown> {
	const pluginName = manifest.name;
	const run = await bundledRun(pluginName, manifest, source);
	try {
		return await run({ event, eventBody, config: bundledConfig(scope) });
	} catch (error) {
		throw new PluginDispatchError(
			`Bundled server for "${pluginName}" failed: ${error instanceof Error ? error.message : String(error)}`,
			502,
		);
	}
}

export async function listTools(
	manifest: PluginManifest,
	scope: TemplateScope,
	method?: string | null,
	source?: BundledSource | null,
): Promise<ToolDefinition[]> {
	const target = remoteTarget(manifest, scope, method);
	if (!target) {
		const tools = await bundledDispatch(
			manifest,
			scope,
			source ?? null,
			"get-tools",
			{},
		);
		return Array.isArray(tools) ? (tools as ToolDefinition[]) : [];
	}

	const result = (await mcpCall(target, "tools/list", {})) as {
		tools?: ToolDefinition[];
	};
	return result.tools ?? [];
}

export async function callTool(
	manifest: PluginManifest,
	scope: TemplateScope,
	tool: string,
	args: Record<string, unknown>,
	method?: string | null,
	source?: BundledSource | null,
): Promise<unknown> {
	const target = remoteTarget(manifest, scope, method);
	if (!target) {
		return await bundledDispatch(manifest, scope, source ?? null, "call-tool", {
			name: tool,
			arguments: args,
		});
	}

	return await mcpCall(target, "tools/call", {
		name: tool,
		arguments: args,
	});
}
