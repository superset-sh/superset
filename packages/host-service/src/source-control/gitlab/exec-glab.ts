import { spawn } from "node:child_process";
import { TRPCError } from "@trpc/server";
import { getToolEnvironment } from "../../terminal/clean-shell-env";

export type GitLabErrorKind =
	| "MISSING_TOOL"
	| "UNAUTHENTICATED"
	| "REJECTED_CREDENTIAL"
	| "INACCESSIBLE_PROJECT"
	| "RATE_LIMIT"
	| "CONFLICT"
	| "UNSUPPORTED_PROVIDER"
	| "REQUEST_FAILED";

export class GitLabError extends TRPCError {
	constructor(
		readonly kind: GitLabErrorKind,
		readonly instance: string,
		readonly statusCode?: number,
	) {
		const hostname = new URL(instance).host;
		const remedy =
			kind === "MISSING_TOOL"
				? "Install the GitLab CLI (glab) on this host."
				: kind === "UNAUTHENTICATED"
					? `Run glab auth login --hostname ${hostname} on this host.`
					: kind === "REJECTED_CREDENTIAL"
						? `GitLab rejected this host's credential for ${hostname}. Check the environment token or run glab auth login --hostname ${hostname}.`
						: kind === "RATE_LIMIT"
							? `GitLab at ${hostname} is rate limiting requests. Try again later.`
							: kind === "INACCESSIBLE_PROJECT"
								? `The GitLab project at ${hostname} is unavailable or access is denied.`
								: kind === "CONFLICT"
									? "The GitLab request conflicts with the current state. Refresh and try again."
									: `GitLab request to ${hostname} failed.`;
		const code =
			kind === "MISSING_TOOL" || kind === "UNAUTHENTICATED"
				? "PRECONDITION_FAILED"
				: kind === "REJECTED_CREDENTIAL"
					? "UNAUTHORIZED"
					: kind === "INACCESSIBLE_PROJECT"
						? "FORBIDDEN"
						: kind === "RATE_LIMIT"
							? "TOO_MANY_REQUESTS"
							: kind === "CONFLICT"
								? "CONFLICT"
								: kind === "UNSUPPORTED_PROVIDER"
									? "BAD_REQUEST"
									: "INTERNAL_SERVER_ERROR";
		super({ code, message: remedy, cause: { kind, instance, statusCode } });
		this.name = "GitLabError";
	}
}

export interface GlabRunnerOptions {
	cwd?: string;
	env: Record<string, string>;
	timeout: number;
	maxBuffer: number;
	input?: string;
}

export type GlabRunner = (
	args: string[],
	options: GlabRunnerOptions,
) => Promise<{ stdout: string; stderr: string }>;

export interface ExecGlabOptions {
	instance: string;
	endpoint: string;
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	fields?: Record<string, unknown>;
	cwd?: string;
	env?: Record<string, string>;
	raw?: boolean;
	timeout?: number;
	maxBuffer?: number;
	runner?: GlabRunner;
}

export type ExecGlab = (options: ExecGlabOptions) => Promise<unknown>;

const TOKEN_KEYS = ["GITLAB_TOKEN", "GITLAB_ACCESS_TOKEN", "OAUTH_TOKEN"];
const INSTANCE_KEYS = [
	"GITLAB_HOST",
	"GITLAB_URI",
	"GL_HOST",
	"GITLAB_API_HOST",
	"GITLAB_SSH_HOST",
	"GITLAB_CLIENT_ID",
	"GLAB_API_PROTOCOL",
	"GLAB_GIT_PROTOCOL",
	"GLAB_CONTAINER_REGISTRY_DOMAINS",
];
const CI_KEYS = [
	"GITLAB_CI",
	"CI_JOB_TOKEN",
	"CI_SERVER_FQDN",
	"CI_SERVER_PROTOCOL",
	"CI_SERVER_SHELL_SSH_HOST",
];

export function configuredGitLabOrigins(
	environment: Record<string, string>,
): string[] {
	const configuredHost =
		environment.GITLAB_HOST || environment.GITLAB_URI || environment.GL_HOST;
	if (!configuredHost) return [];
	try {
		const protocol =
			environment.GLAB_API_PROTOCOL === "http" ? "http" : "https";
		const url = new URL(
			configuredHost.includes("://")
				? configuredHost
				: `${protocol}://${configuredHost}`,
		);
		if (
			url.username ||
			url.password ||
			url.pathname !== "/" ||
			url.search ||
			url.hash ||
			!["http:", "https:"].includes(url.protocol)
		) {
			return [];
		}
		return [url.origin.toLowerCase()];
	} catch {
		return [];
	}
}

export function configuredGitLabSshHosts(
	environment: Record<string, string>,
): { sshHost: string; instance: string }[] {
	const instance = configuredGitLabOrigins(environment)[0];
	const sshHost = environment.GITLAB_SSH_HOST;
	return instance && sshHost ? [{ sshHost, instance }] : [];
}

export function environmentForGitLabInstance(
	environment: Record<string, string>,
	instance: string,
): Record<string, string> {
	const target = new URL(instance);
	const env = { ...environment };
	const configuredOrigin = configuredGitLabOrigins(env)[0];
	if (configuredOrigin !== target.origin.toLowerCase()) {
		for (const key of [...TOKEN_KEYS, ...INSTANCE_KEYS]) delete env[key];
	}
	delete env.GITLAB_URI;
	delete env.GL_HOST;
	delete env.GITLAB_SUBFOLDER;
	env.GITLAB_HOST = target.host;
	env.GLAB_API_PROTOCOL = target.protocol.slice(0, -1);
	delete env.GLAB_DEBUG_HTTP;
	delete env.GLAB_ENABLE_CI_AUTOLOGIN;
	for (const key of CI_KEYS) delete env[key];
	return env;
}

const runGlab: GlabRunner = (args, options) =>
	new Promise((resolve, reject) => {
		const child = spawn("glab", args, {
			cwd: options.cwd,
			env: options.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let size = 0;
		let settled = false;
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) reject(error);
			else
				resolve({
					stdout: Buffer.concat(stdout).toString("utf8"),
					stderr: Buffer.concat(stderr).toString("utf8"),
				});
		};
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish(new Error("GLAB_TIMEOUT"));
		}, options.timeout);
		child.stdout.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > options.maxBuffer) {
				child.kill("SIGKILL");
				finish(new Error("GLAB_OUTPUT_LIMIT"));
			} else stdout.push(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > options.maxBuffer) {
				child.kill("SIGKILL");
				finish(new Error("GLAB_OUTPUT_LIMIT"));
			} else stderr.push(chunk);
		});
		child.on("error", finish);
		child.stdin.on("error", (error: NodeJS.ErrnoException) => {
			if (error.code !== "EPIPE") finish(error);
		});
		child.on("close", (code) => {
			if (code === 0) finish();
			else finish(new Error(Buffer.concat(stderr).toString("utf8")));
		});
		child.stdin.end(options.input);
	});

function classifyGitLabFailure(error: unknown, instance: string): GitLabError {
	const value = error instanceof Error ? error.message : String(error);
	const code = (error as NodeJS.ErrnoException)?.code;
	if (code === "ENOENT") return new GitLabError("MISSING_TOOL", instance);
	if (/429|rate limit/i.test(value))
		return new GitLabError("RATE_LIMIT", instance, 429);
	if (/\b409\b/.test(value)) return new GitLabError("CONFLICT", instance, 409);
	if (
		/not logged in|authentication required|no token|login first/i.test(value)
	) {
		return new GitLabError("UNAUTHENTICATED", instance);
	}
	if (
		/401|invalid_grant|unauthorized|invalid token|bad credentials/i.test(value)
	) {
		return new GitLabError("REJECTED_CREDENTIAL", instance, 401);
	}
	if (/403|404|forbidden|not found/i.test(value)) {
		return new GitLabError(
			"INACCESSIBLE_PROJECT",
			instance,
			/404|not found/i.test(value) ? 404 : 403,
		);
	}
	return new GitLabError("REQUEST_FAILED", instance);
}

export const execGlab: ExecGlab = async (options) => {
	const instance = new URL(options.instance).origin;
	if (/^\w+:\/\//.test(options.endpoint) || options.endpoint.includes("..")) {
		throw new GitLabError("UNSUPPORTED_PROVIDER", instance);
	}
	const method = options.method ?? "GET";
	const endpoint = options.endpoint.replace(/^\/+/, "");
	const search = new URLSearchParams();
	if (method === "GET" || method === "DELETE") {
		for (const [key, value] of Object.entries(options.fields ?? {})) {
			if (value === undefined || value === null) continue;
			if (Array.isArray(value)) {
				for (const item of value)
					search.append(key.endsWith("[]") ? key : `${key}[]`, String(item));
			} else {
				search.append(
					key,
					typeof value === "object" ? JSON.stringify(value) : String(value),
				);
			}
		}
	}
	const path = search.size
		? `${endpoint}${endpoint.includes("?") ? "&" : "?"}${search}`
		: endpoint;
	const args = [
		"api",
		path,
		"--hostname",
		new URL(instance).host,
		"--method",
		method,
	];
	const input =
		method === "GET" || method === "DELETE" || !options.fields
			? undefined
			: JSON.stringify(options.fields);
	if (input) args.push("--input", "-");
	const env = environmentForGitLabInstance(
		options.env ?? (await getToolEnvironment()),
		instance,
	);
	try {
		const result = await (options.runner ?? runGlab)(args, {
			cwd: options.cwd,
			env,
			timeout: options.timeout ?? 15_000,
			maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
			input,
		});
		if (options.raw) return result.stdout;
		const output = result.stdout.trim();
		if (!output) return {};
		try {
			return JSON.parse(output);
		} catch {
			return output;
		}
	} catch (error) {
		throw classifyGitLabFailure(error, instance);
	}
};
