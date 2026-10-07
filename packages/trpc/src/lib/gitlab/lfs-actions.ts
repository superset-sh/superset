import { isIP } from "node:net";
import { z } from "zod";
import { open, seal } from "../secret-box";
import { authorizeGitlabSandboxRequest } from "./sandbox-request";

export interface GitlabLfsScope {
	organizationId: string;
	workspaceId: string;
	connectionId: string;
	providerTeamId: string;
	providerProjectId: string;
	sandboxId: string;
	sandboxName: string;
	projectId: number;
	projectPath: string;
	origin: string;
}
type Operation = "download" | "upload";
type Action = Operation | "verify";
interface ObjectIdentity {
	oid: string;
	size: number;
}
interface Batch {
	operation: Operation;
	objects: ObjectIdentity[];
}
interface ClientAction {
	href: string;
	expires_in: number;
}
interface ClientObject extends ObjectIdentity {
	authenticated?: true;
	actions?: Partial<Record<Action, ClientAction>>;
	error?: { code: number; message: string };
}
export interface GitlabLfsBatchResponse {
	transfer: "basic";
	objects: ClientObject[];
	hash_algo: "sha256";
}
export interface GitlabLfsActionPlan extends ObjectIdentity {
	operation: Operation;
	action: Action;
	method: "GET" | "PUT" | "POST";
	url: string;
	headers: Record<string, string>;
	expiresAt: number;
	offHost: boolean;
	body?: string;
}
const prefix = "/.superset/lfs/";
const methods = { download: "GET", upload: "PUT", verify: "POST" } as const;
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const oid = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/);
const scopeSchema = z
	.object({
		organizationId: identity,
		workspaceId: identity,
		connectionId: identity,
		providerTeamId: identity,
		providerProjectId: identity,
		sandboxId: identity,
		sandboxName: identity,
		projectId: integer.positive(),
		projectPath: z.string().max(1024),
		origin: z.string().max(300),
	})
	.strict();
const upstreamAction = z.object({
	href: z.string().max(4096),
	header: z.record(z.string(), z.string()).optional(),
	expires_in: z.unknown().optional(),
	expires_at: z.unknown().optional(),
});
const responseSchema = z.object({
	transfer: z.literal("basic").optional(),
	hash_algo: z.literal("sha256").optional(),
	objects: z
		.array(
			z.object({
				oid,
				size: integer,
				actions: z.record(z.string(), upstreamAction).optional(),
				error: z
					.object({
						code: z.number().int().min(400).max(599),
						message: z.string().optional(),
					})
					.optional(),
			}),
		)
		.min(1)
		.max(1000),
});
const ticketSchema = z
	.object({
		version: z.literal(1),
		operation: z.enum(["download", "upload"]),
		action: z.enum(["download", "upload", "verify"]),
		oid,
		size: integer,
		url: z.string().max(4096),
		headers: z.record(z.string(), z.string()),
		issuedAt: integer,
		expiresAt: integer,
	})
	.strict();
function invalid(): never {
	throw new Error("Invalid GitLab LFS action");
}
function hasControls(value: string): boolean {
	return Array.from(value).some(
		(character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
	);
}
function time(now: number): void {
	if (
		!Number.isSafeInteger(now) ||
		now < 0 ||
		now > Number.MAX_SAFE_INTEGER - 3600
	)
		invalid();
}
function dnsOrigin(raw: string): URL {
	if (
		!/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?]|$)/.test(raw) ||
		/[\s\\#]/.test(raw) ||
		hasControls(raw)
	)
		invalid();
	const url = new URL(raw);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.hash ||
		url.port ||
		isIP(url.hostname) ||
		url.hostname.length > 253 ||
		!url.hostname
			.split(".")
			.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
	)
		invalid();
	return url;
}
function scopeAad(scope: GitlabLfsScope): string {
	scopeSchema.parse(scope);
	if (dnsOrigin(scope.origin).origin !== scope.origin) invalid();
	authorizeGitlabSandboxRequest({
		projectId: scope.projectId,
		projectPath: scope.projectPath,
		path: `/api/v4/projects/${scope.projectId}`,
		method: "GET",
	});
	return JSON.stringify([
		"superset.gitlab.lfs-action",
		1,
		scope.organizationId,
		scope.workspaceId,
		scope.connectionId,
		scope.providerTeamId,
		scope.providerProjectId,
		scope.sandboxId,
		scope.sandboxName,
		scope.projectId,
		scope.projectPath,
		scope.origin,
	]);
}
function inspectPath(path: string): void {
	for (const segment of path.split("/")) {
		let value = segment;
		for (let round = 0; round < 8; round++) {
			if (
				value.includes("\\") ||
				hasControls(value) ||
				value.split("/").some((part) => part === "." || part === "..")
			)
				invalid();
			let next: string;
			try {
				next = decodeURIComponent(value);
			} catch {
				if (round === 0) invalid();
				break;
			}
			if (next === value) break;
			if (round === 7) invalid();
			value = next;
		}
	}
}
function target(
	scope: GitlabLfsScope,
	action: Action,
	object: ObjectIdentity,
	raw: string,
): { url: string; offHost: boolean } {
	const url = dnsOrigin(raw);
	const rawPath = /^https:\/\/[^/?#]+([^?#]*)/.exec(raw)?.[1] ?? "";
	inspectPath(rawPath);
	const offHost = url.origin !== scope.origin;
	if (!offHost) {
		const objectPath = `/${scope.projectPath}.git/gitlab-lfs/objects/${object.oid}`;
		const allowed =
			action === "download"
				? [objectPath]
				: action === "upload"
					? [`${objectPath}/${object.size}`]
					: [objectPath, `${objectPath}/verify`];
		if (!allowed.includes(url.pathname)) invalid();
	} else if (
		url.hostname === "localhost" ||
		url.hostname.endsWith(".localhost") ||
		!url.hostname.includes(".")
	)
		invalid();
	return { url: raw, offHost };
}
function tokenIn(value: string, token: string): boolean {
	let decoded = value;
	for (let round = 0; round < 9; round++) {
		if (decoded.includes(token)) return true;
		const next = decoded.replace(/%([a-f\d]{2})/gi, (_match, hex: string) =>
			String.fromCharCode(Number.parseInt(hex, 16)),
		);
		if (next === decoded) break;
		decoded = next;
	}
	if (
		/^Basic\s+/i.test(value) &&
		Buffer.from(value.replace(/^Basic\s+/i, ""), "base64")
			.toString("utf8")
			.includes(token)
	)
		return true;
	return false;
}
function privateHeaders(
	input: Record<string, string>,
	organizationToken?: string,
): Record<string, string> {
	const entries = Object.entries(input);
	if (entries.length > 32) invalid();
	const normalized = new Map<string, string>();
	let bytes = 0;
	for (const [name, value] of entries) {
		const key = name.toLowerCase();
		if (
			!/^[!#$%&'*+.^_`|~\da-z-]+$/i.test(name) ||
			hasControls(value) ||
			normalized.has(key)
		)
			invalid();
		bytes += Buffer.byteLength(name) + Buffer.byteLength(value);
		const canonical = value.trim();
		if (
			bytes > 4096 ||
			(organizationToken && tokenIn(canonical, organizationToken))
		)
			invalid();
		normalized.set(key, canonical);
	}
	const nominated = (normalized.get("connection") ?? "")
		.split(",")
		.map((name) => name.trim().toLowerCase());
	for (const name of [
		...nominated,
		"host",
		"cookie",
		"set-cookie",
		"connection",
		"keep-alive",
		"transfer-encoding",
		"content-length",
		"te",
		"trailer",
		"upgrade",
		"proxy-authenticate",
		"proxy-authorization",
		"proxy-connection",
	]) {
		normalized.delete(name);
	}
	for (const name of normalized.keys())
		if (
			name.startsWith("vercel-") ||
			name.startsWith("x-forwarded-") ||
			name === "forwarded"
		)
			normalized.delete(name);
	return Object.fromEntries(normalized);
}
function expiry(action: z.infer<typeof upstreamAction>, now: number): number {
	let lifetime = 3600;
	if (action.expires_in !== undefined) {
		if (
			typeof action.expires_in !== "number" ||
			!Number.isInteger(action.expires_in) ||
			action.expires_in <= 0 ||
			action.expires_in > 2147483647
		)
			invalid();
		lifetime = Math.min(lifetime, action.expires_in);
	} else if (action.expires_at !== undefined) {
		if (typeof action.expires_at !== "string") invalid();
		const parts =
			/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:Z|[+-](\d\d):(\d\d))$/.exec(
				action.expires_at,
			);
		if (!parts) invalid();
		const [year, month, day, hour, minute, second] = parts
			.slice(1, 7)
			.map(Number);
		const leap =
			Number(year) % 4 === 0 &&
			(Number(year) % 100 !== 0 || Number(year) % 400 === 0);
		const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
			Number(month) - 1
		];
		if (
			!days ||
			Number(day) < 1 ||
			Number(day) > days ||
			Number(hour) > 23 ||
			Number(minute) > 59 ||
			Number(second) > 59 ||
			Number(parts[7] ?? 0) > 23 ||
			Number(parts[8] ?? 0) > 59
		)
			invalid();
		const seconds = Date.parse(action.expires_at) / 1000;
		if (!Number.isSafeInteger(seconds) || seconds <= now) invalid();
		lifetime = Math.min(lifetime, seconds - now);
	}
	return now + lifetime;
}
function actionCompatible(
	operation: Operation,
	action: string,
): action is Action {
	return operation === "download"
		? action === "download"
		: action === "upload" || action === "verify";
}
export function rewriteGitlabLfsBatch(input: {
	scope: GitlabLfsScope;
	batch: unknown;
	response: unknown;
	organizationToken: string;
	now: number;
}): GitlabLfsBatchResponse {
	try {
		const aad = scopeAad(input.scope);
		time(input.now);
		if (
			typeof input.organizationToken !== "string" ||
			!input.organizationToken ||
			input.organizationToken.length > 4096 ||
			hasControls(input.organizationToken)
		)
			invalid();
		const authorized = authorizeGitlabSandboxRequest({
			projectId: input.scope.projectId,
			projectPath: input.scope.projectPath,
			path: `/${input.scope.projectPath}.git/info/lfs/objects/batch`,
			method: "POST",
			contentType: "application/vnd.git-lfs+json",
			body: JSON.stringify(input.batch),
		});
		const batch = JSON.parse(authorized.body ?? "") as Batch;
		const response = responseSchema.parse(input.response);
		if (response.objects.length !== batch.objects.length) invalid();
		const requested = new Map<string, number>();
		for (const object of batch.objects) {
			const key = `${object.oid}:${object.size}`;
			requested.set(key, (requested.get(key) ?? 0) + 1);
		}
		const objects: ClientObject[] = response.objects.map((object) => {
			const key = `${object.oid}:${object.size}`;
			const remaining = requested.get(key) ?? 0;
			if (!remaining) invalid();
			requested.set(key, remaining - 1);
			const result: ClientObject = { oid: object.oid, size: object.size };
			const names = Object.keys(object.actions ?? {});
			if (object.error) {
				if (names.length) invalid();
				return {
					...result,
					error: {
						code: object.error.code,
						message: "GitLab LFS object unavailable",
					},
				};
			}
			if (!names.length) {
				if (batch.operation !== "upload") invalid();
				return result;
			}
			if (batch.operation === "upload" && !names.includes("upload")) invalid();
			const actions: Partial<Record<Action, ClientAction>> = {};
			for (const name of names) {
				if (!actionCompatible(batch.operation, name)) invalid();
				const action = object.actions?.[name];
				if (!action) invalid();
				const destination = target(input.scope, name, object, action.href);
				if (
					destination.offHost &&
					tokenIn(destination.url, input.organizationToken)
				)
					invalid();
				const headers = privateHeaders(
					action.header ?? {},
					destination.offHost ? input.organizationToken : undefined,
				);
				const expiresAt = expiry(action, input.now);
				const plaintext = JSON.stringify({
					version: 1,
					operation: batch.operation,
					action: name,
					oid: object.oid,
					size: object.size,
					url: destination.url,
					headers,
					issuedAt: input.now,
					expiresAt,
				});
				if (Buffer.byteLength(plaintext) > 10000) invalid();
				const ticket = Buffer.from(seal(plaintext, aad), "base64").toString(
					"base64url",
				);
				if (prefix.length + ticket.length >= 16384) invalid();
				actions[name] = {
					href: input.scope.origin + prefix + ticket,
					expires_in: expiresAt - input.now,
				};
			}
			return { ...result, authenticated: true, actions };
		});
		return { transfer: "basic", objects, hash_algo: "sha256" };
	} catch {
		return invalid();
	}
}
export function openGitlabLfsAction(input: {
	scope: GitlabLfsScope;
	path: string;
	method: string;
	body?: string;
	now: number;
}): GitlabLfsActionPlan {
	try {
		const aad = scopeAad(input.scope);
		time(input.now);
		if (input.path.length >= 16384 || !input.path.startsWith(prefix)) invalid();
		const ticket = input.path.slice(prefix.length);
		if (
			!/^[A-Za-z0-9_-]+$/.test(ticket) ||
			Buffer.from(ticket, "base64url").toString("base64url") !== ticket
		)
			invalid();
		const plaintext = open(
			Buffer.from(ticket, "base64url").toString("base64"),
			aad,
		);
		if (Buffer.byteLength(plaintext) > 10000) invalid();
		const value = ticketSchema.parse(JSON.parse(plaintext));
		if (
			!actionCompatible(value.operation, value.action) ||
			value.issuedAt > input.now ||
			value.expiresAt <= input.now ||
			value.expiresAt <= value.issuedAt ||
			value.expiresAt - value.issuedAt > 3600 ||
			input.method !== methods[value.action]
		)
			invalid();
		const destination = target(input.scope, value.action, value, value.url);
		const headers = privateHeaders(value.headers);
		let body: string | undefined;
		if (value.action === "verify") {
			if (input.body === undefined || Buffer.byteLength(input.body) > 1024)
				invalid();
			const identity = z
				.object({ oid: z.literal(value.oid), size: z.literal(value.size) })
				.strict()
				.parse(JSON.parse(input.body));
			body = JSON.stringify(identity);
		} else if (input.body !== undefined && input.body !== "") invalid();
		return {
			operation: value.operation,
			action: value.action,
			method: methods[value.action],
			oid: value.oid,
			size: value.size,
			...destination,
			headers,
			expiresAt: value.expiresAt,
			...(body === undefined ? {} : { body }),
		};
	} catch {
		return invalid();
	}
}
