import { z } from "zod";

export interface GitlabSandboxRequestInput {
	projectId: number;
	projectPath: string;
	path: string;
	method: string;
	contentType?: string;
	body?: string;
	fork?: { projectId: number; projectPath: string; headSha: string };
}
export interface GitlabSandboxRequestPlan {
	kind: "git" | "api" | "lfs-batch" | "lfs-lock";
	path: string;
	body?: string;
	sameProjectMr?: number;
	responseType?: "text";
}
function deny(): never {
	throw new Error("Unsupported GitLab sandbox request");
}
const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const boolean = z.union([
	z.boolean(),
	z.enum(["true", "false"]).transform((value) => value === "true"),
]);
const text = z.string().max(65536);
const branch = z
	.string()
	.min(1)
	.max(1024)
	.refine(
		(value) =>
			!/[\s\\~^:?*[]/.test(value) &&
			!value.includes("..") &&
			!value.includes("@{") &&
			!value.startsWith("/") &&
			!value.endsWith("/") &&
			!value.endsWith(".") &&
			value
				.split("/")
				.every(
					(segment) =>
						segment && !segment.startsWith(".") && !segment.endsWith(".lock"),
				),
	);
const sha = z.string().regex(/^[a-fA-F0-9]{6,64}$/);
const pagination = { page: id.optional(), per_page: id.max(100).optional() };
const readQueries = {
	list: z.object(pagination).strict(),
	branches: z
		.object({ ...pagination, search: z.string().max(512).optional() })
		.strict(),
	mrs: z
		.object({
			...pagination,
			state: z.enum(["opened", "closed", "locked", "merged", "all"]).optional(),
			source_branch: branch.optional(),
			target_branch: branch.optional(),
			search: z.string().max(512).optional(),
			labels: z.string().max(4096).optional(),
			author_username: z.string().min(1).max(255).optional(),
			scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional(),
			order_by: z.enum(["created_at", "updated_at", "title"]).optional(),
			sort: z.enum(["asc", "desc"]).optional(),
		})
		.strict(),
	mr: z.object({ include_rebase_in_progress: boolean.optional() }).strict(),
	issues: z
		.object({
			...pagination,
			state: z.enum(["opened", "closed", "all"]).optional(),
			search: z.string().max(512).optional(),
			labels: z.string().max(4096).optional(),
			author_username: z.string().min(1).max(255).optional(),
			scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional(),
			order_by: z.enum(["created_at", "updated_at", "title"]).optional(),
			sort: z.enum(["asc", "desc"]).optional(),
		})
		.strict(),
	pipelines: z
		.object({
			...pagination,
			sha: sha.optional(),
			ref: branch.optional(),
			status: z
				.enum([
					"created",
					"waiting_for_resource",
					"preparing",
					"pending",
					"running",
					"success",
					"failed",
					"canceled",
					"skipped",
					"manual",
					"scheduled",
				])
				.optional(),
			order_by: z
				.enum(["id", "status", "ref", "updated_at", "user_id"])
				.optional(),
			sort: z.enum(["asc", "desc"]).optional(),
		})
		.strict(),
	empty: z.object({}).strict(),
};
const mutationBodies = {
	update: z
		.object({
			title: text.optional(),
			description: text.optional(),
			state_event: z.enum(["close", "reopen"]).optional(),
		})
		.strict(),
	merge: z
		.object({
			squash: boolean.optional(),
			merge_commit_message: text.optional(),
			squash_commit_message: text.optional(),
			sha: sha.optional(),
		})
		.strict(),
	rebase: z.object({}).strict(),
	resolve: z.object({ resolved: boolean }).strict(),
	reply: z.object({ body: text.min(1) }).strict(),
};
const oid = z.string().regex(/^[a-f0-9]{64}$/);
const batch = z
	.object({
		operation: z.enum(["download", "upload"]),
		transfers: z
			.array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
			.min(1)
			.max(16)
			.refine(
				(values) =>
					values.includes("basic") && new Set(values).size === values.length,
			)
			.transform(() => ["basic"])
			.optional(),
		objects: z
			.array(
				z
					.object({
						oid,
						size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
					})
					.strict(),
			)
			.min(1)
			.max(1000),
		ref: z.object({ name: branch }).strict().nullish(),
		hash_algo: z.literal("sha256").optional(),
	})
	.strict();

function fields(query: URLSearchParams): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of query) {
		if (Object.hasOwn(result, key) || key === "__proto__") deny();
		Object.defineProperty(result, key, { value, enumerable: true });
	}
	return result;
}
function validate(schema: z.ZodType, value: unknown): Record<string, unknown> {
	const result = schema.safeParse(value);
	if (!result.success) deny();
	return result.data as Record<string, unknown>;
}
function body(
	input: GitlabSandboxRequestInput,
	schema: z.ZodType,
	lfs = false,
): string {
	if (input.body === undefined || Buffer.byteLength(input.body) > 1048576)
		deny();
	const type = (input.contentType ?? "").split(";")[0]?.trim().toLowerCase();
	let value: unknown;
	if (
		type === "application/json" ||
		(lfs && type === "application/vnd.git-lfs+json")
	) {
		try {
			value = JSON.parse(input.body);
		} catch {
			deny();
		}
	} else if (type === "application/x-www-form-urlencoded")
		value = fields(new URLSearchParams(input.body));
	else deny();
	return JSON.stringify(validate(schema, value));
}
function readPath(
	path: string,
	query: URLSearchParams,
	schema: z.ZodType,
): string {
	const parsed = validate(schema, fields(query));
	const canonical = new URLSearchParams();
	for (const key of query.keys()) canonical.set(key, String(parsed[key]));
	const suffix = canonical.toString();
	return path + (suffix ? `?${suffix}` : "");
}
function emptyRead(input: GitlabSandboxRequestInput): void {
	if (input.method !== "GET" && input.method !== "HEAD") deny();
	if (input.body !== undefined && input.body !== "") deny();
}
function selectedProject(input: GitlabSandboxRequestInput): void {
	if (
		!Number.isSafeInteger(input.projectId) ||
		input.projectId <= 0 ||
		input.projectPath.length > 1024 ||
		!input.projectPath.includes("/") ||
		!input.projectPath
			.split("/")
			.every(
				(part) =>
					/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(part) &&
					part !== "." &&
					part !== "..",
			)
	)
		deny();
}
function rawSegments(path: string): {
	segments: string[];
	query: URLSearchParams;
} {
	if (
		path.length > 16384 ||
		!path.startsWith("/") ||
		/[\s\\#]/.test(path) ||
		Array.from(path).some(
			(c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
		)
	)
		deny();
	const question = path.indexOf("?");
	const pathname = question < 0 ? path : path.slice(0, question);
	const segments = pathname
		.slice(1)
		.split("/")
		.map((segment) => {
			let decoded: string;
			try {
				decoded = decodeURIComponent(segment);
			} catch {
				return deny();
			}
			let shadow = decoded;
			for (let round = 0; round < 8; round++) {
				if (
					!shadow ||
					shadow.includes("\\") ||
					shadow.split("/").some((part) => part === "." || part === "..") ||
					Array.from(shadow).some(
						(c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
					)
				)
					deny();
				let next: string;
				try {
					next = decodeURIComponent(shadow);
				} catch {
					break;
				}
				if (next === shadow) break;
				if (round === 7) deny();
				shadow = next;
			}
			return decoded;
		});
	return {
		segments,
		query: new URLSearchParams(question < 0 ? "" : path.slice(question + 1)),
	};
}

export function authorizeGitlabSandboxRequest(
	input: GitlabSandboxRequestInput,
): GitlabSandboxRequestPlan {
	selectedProject(input);
	const { segments, query } = rawSegments(input.path);
	const pathname = input.path.split("?")[0] ?? "";
	const gitRoot = `/${input.projectPath}.git`;
	if (pathname === `${gitRoot}/info/refs`) {
		emptyRead(input);
		return {
			kind: "git",
			path: readPath(
				pathname,
				query,
				z
					.object({ service: z.enum(["git-upload-pack", "git-receive-pack"]) })
					.strict(),
			),
		};
	}
	if (
		pathname === `${gitRoot}/git-upload-pack` ||
		pathname === `${gitRoot}/git-receive-pack`
	) {
		const service = pathname.slice(gitRoot.length + 1);
		if (
			input.method !== "POST" ||
			query.size ||
			input.contentType?.split(";")[0]?.trim().toLowerCase() !==
				`application/x-${service}-request`
		)
			deny();
		return { kind: "git", path: pathname };
	}
	if (pathname.startsWith(`${gitRoot}/info/lfs/`)) {
		const suffix = pathname.slice(`${gitRoot}/info/lfs/`.length);
		if (suffix === "objects/batch" && input.method === "POST" && !query.size)
			return {
				kind: "lfs-batch",
				path: pathname,
				body: body(input, batch, true),
			};
		if (
			suffix === "locks" &&
			(input.method === "GET" || input.method === "HEAD")
		) {
			emptyRead(input);
			return {
				kind: "lfs-lock",
				path: readPath(
					pathname,
					query,
					z
						.object({
							path: text.optional(),
							id: id.optional(),
							cursor: z.string().max(1024).optional(),
							limit: id.max(100).optional(),
						})
						.strict(),
				),
			};
		}
		if (input.method !== "POST" || query.size) deny();
		const schema =
			suffix === "locks"
				? z
						.object({
							path: z
								.string()
								.min(1)
								.max(4096)
								.refine(
									(value) =>
										!value.startsWith("/") &&
										!value.includes("\\") &&
										value
											.split("/")
											.every((part) => part && part !== "." && part !== ".."),
								),
							ref: z.object({ name: branch }).strict().nullish(),
						})
						.strict()
				: suffix === "locks/verify"
					? z
							.object({
								cursor: z.string().max(1024).optional(),
								limit: id.max(100).optional(),
								ref: z.object({ name: branch }).strict().nullish(),
							})
							.strict()
					: /^locks\/[1-9]\d*\/unlock$/.test(suffix)
						? z
								.object({
									force: boolean.optional(),
									ref: z.object({ name: branch }).strict().nullish(),
								})
								.strict()
						: null;
		if (!schema) deny();
		return {
			kind: "lfs-lock",
			path: pathname,
			body: body(input, schema, true),
		};
	}
	if (pathname === "/api/v4/user") {
		emptyRead(input);
		return { kind: "api", path: readPath(pathname, query, readQueries.empty) };
	}
	const fork =
		input.fork &&
		segments[3] === String(input.fork.projectId) &&
		input.fork.projectId !== input.projectId
			? input.fork
			: null;
	const selectedId = fork?.projectId ?? input.projectId;
	if (
		segments[0] !== "api" ||
		segments[1] !== "v4" ||
		segments[2] !== "projects" ||
		(segments[3] !== String(selectedId) && segments[3] !== input.projectPath)
	)
		deny();
	const rest = segments.slice(4);
	if (fork) {
		emptyRead(input);
		selectedProject({
			...input,
			projectId: fork.projectId,
			projectPath: fork.projectPath,
		});
		const metadata = rest.length === 0;
		const pipelines =
			rest.length === 1 &&
			rest[0] === "pipelines" &&
			query.get("sha") === fork.headSha &&
			!query.has("ref");
		const jobs =
			rest.length === 3 &&
			rest[0] === "pipelines" &&
			/^[1-9]\d*$/.test(rest[1] ?? "") &&
			rest[2] === "jobs";
		const statuses =
			rest.length === 4 &&
			rest[0] === "repository" &&
			rest[1] === "commits" &&
			rest[2] === fork.headSha &&
			rest[3] === "statuses";
		const trace =
			rest.length === 3 &&
			rest[0] === "jobs" &&
			/^[1-9]\d*$/.test(rest[1] ?? "") &&
			rest[2] === "trace";
		if (!metadata && !pipelines && !jobs && !statuses && !trace) deny();
	}
	const positive = (part: string | undefined) =>
		part !== undefined &&
		/^[1-9]\d*$/.test(part) &&
		Number.isSafeInteger(Number(part));
	const numericMr = rest[0] === "merge_requests" && positive(rest[1]);
	const discussion =
		numericMr &&
		rest[2] === "discussions" &&
		(rest[3]?.length ?? 0) > 0 &&
		(rest[3]?.length ?? 0) <= 256;
	const canonical =
		`/api/v4/projects/${selectedId}` +
		(rest.length ? `/${rest.map(encodeURIComponent).join("/")}` : "");
	if (input.method === "GET" || input.method === "HEAD") {
		emptyRead(input);
		let schema: z.ZodType | undefined;
		if (!rest.length) schema = readQueries.empty;
		else if (
			rest[0] === "repository" &&
			rest[1] === "branches" &&
			rest.length === 2
		)
			schema = readQueries.branches;
		else if (
			rest[0] === "repository" &&
			rest[1] === "branches" &&
			rest.length === 3 &&
			branch.safeParse(rest[2]).success
		)
			schema = readQueries.empty;
		else if (rest[0] === "merge_requests" && rest.length === 1)
			schema = readQueries.mrs;
		else if (numericMr && rest.length === 2) schema = readQueries.mr;
		else if (
			numericMr &&
			rest.length === 3 &&
			[
				"diffs",
				"approvals",
				"approval_state",
				"reviewers",
				"discussions",
			].includes(rest[2] ?? "")
		)
			schema = ["approvals", "approval_state"].includes(rest[2] ?? "")
				? readQueries.empty
				: readQueries.list;
		else if (rest[0] === "issues" && rest.length === 1)
			schema = readQueries.issues;
		else if (rest[0] === "issues" && rest.length === 2 && positive(rest[1]))
			schema = readQueries.empty;
		else if (rest[0] === "pipelines" && rest.length === 1)
			schema = readQueries.pipelines;
		else if (
			rest[0] === "pipelines" &&
			rest.length === 3 &&
			positive(rest[1]) &&
			rest[2] === "jobs"
		)
			schema = readQueries.list;
		else if (
			rest[0] === "repository" &&
			rest[1] === "commits" &&
			rest.length === 4 &&
			sha.safeParse(rest[2]).success &&
			rest[3] === "statuses"
		)
			schema = readQueries.list;
		if (
			rest[0] === "jobs" &&
			rest.length === 3 &&
			positive(rest[1]) &&
			rest[2] === "trace"
		) {
			return {
				kind: "api",
				responseType: "text",
				path: readPath(canonical, query, readQueries.empty),
			};
		}
		if (!schema) deny();
		return { kind: "api", path: readPath(canonical, query, schema) };
	}
	if (query.size) deny();
	let schema: z.ZodType | undefined;
	let sameProjectMr: number | undefined;
	if (
		input.method === "POST" &&
		rest.length === 1 &&
		rest[0] === "merge_requests"
	)
		schema = z
			.object({
				source_branch: branch,
				target_branch: branch,
				target_project_id: z
					.union([
						z.literal(input.projectId),
						z.literal(String(input.projectId)),
					])
					.transform(() => input.projectId)
					.optional(),
				title: text.min(1),
				description: text.optional(),
			})
			.strict();
	else if (input.method === "PUT" && numericMr && rest.length === 2)
		schema = mutationBodies.update;
	else if (
		input.method === "PUT" &&
		numericMr &&
		rest.length === 3 &&
		rest[2] === "merge"
	)
		schema = mutationBodies.merge;
	else if (
		input.method === "PUT" &&
		numericMr &&
		rest.length === 3 &&
		rest[2] === "rebase"
	) {
		schema = mutationBodies.rebase;
		sameProjectMr = Number(rest[1]);
	} else if (input.method === "PUT" && discussion && rest.length === 4)
		schema = mutationBodies.resolve;
	else if (
		input.method === "POST" &&
		discussion &&
		rest.length === 5 &&
		rest[4] === "notes"
	)
		schema = mutationBodies.reply;
	if (!schema) deny();
	return {
		kind: "api",
		path: canonical,
		body: body(input, schema),
		...(sameProjectMr === undefined ? {} : { sameProjectMr }),
	};
}
