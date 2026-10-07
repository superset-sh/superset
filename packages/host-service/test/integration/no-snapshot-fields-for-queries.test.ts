import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import ts from "@typescript/typescript6";

/**
 * Hardening guard. GitHub queries must derive owner/name from the live
 * local remote via `resolveGithubRepo(ctx, projectId)` — never from cloud
 * `repoCloneUrl` or cached `projects.repoOwner`/`repoName`, which drift on
 * rename/fork/remote re-point and silently misroute queries.
 *
 * If a new query trips this test: don't add to the allowlist. Call
 * `resolveGithubRepo` instead. The allowlist is for snapshot consumers
 * (schema, setup pipeline, persistence), not query consumers.
 */
const HOST_SERVICE_SRC = resolve(import.meta.dir, "../../src");

const ALLOWLIST = new Set([
	// Schema and setup pipeline — declares the columns and writes them.
	"db/schema.ts",
	"trpc/router/project/handlers.ts",
	"trpc/router/project/project.ts",
	"trpc/router/project/utils/persist-project.ts",

	// Snapshot consumer: shapes project rows for renderer display
	// (avatar/GitHub link), never for query routing.
	"projects/local-project-store.ts",

	// Resolver itself: mentions field names in JSDoc, no member reads.
	"trpc/router/workspace-creation/shared/project-helpers.ts",

	// Snapshot consumer: matches the host's own `pull_requests` rows against
	// the identity `resolveGithubRepo` already returned; never routes a query.
	"trpc/router/pull-requests/shared/linked-workspaces.ts",

	// TODO: PR-runtime poller still keys repo identity off cached
	// `project.repoOwner`/`repoName`. Migration needs cache invalidation
	// rethink (GitWatcher → bust on `.git/config` changes).
	"runtime/pull-requests/pull-requests.ts",

	// TODO: `git.getPullRequestSidebar` forwards cached `pull_requests.repoOwner`/
	// `repoName` to the renderer. Either drop from the response shape or
	// derive via `resolveGithubRepo` per render.
	"trpc/router/git/git.ts",
]);

// Member-access reads only — `cloudProject.repoCloneUrl` and
// `get.query().repoCloneUrl` both match; `{ repoCloneUrl: … }` doesn't.
const FORBIDDEN = /\.(repoCloneUrl|repoOwner|repoName)\b/;

interface Violation {
	file: string;
	line: number;
	text: string;
}

function fingerprint(text: string): string {
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		true,
		ts.LanguageVariant.Standard,
		text,
	);
	const tokens: Array<[ts.SyntaxKind, string]> = [];
	for (
		let kind = scanner.scan();
		kind !== ts.SyntaxKind.EndOfFileToken;
		kind = scanner.scan()
	)
		tokens.push([kind, scanner.getTokenText()]);
	return createHash("sha256").update(JSON.stringify(tokens)).digest("hex");
}

// Changed live-binding checks require review before updating these fingerprints.
const EXPECTED_BINDING_NODES = {
	gitLabActionContext:
		"8c437e2c5f8512ad331701449c0a93e84e48d3e0c663af815f35d8cd7d18f7ff",
	gitLabWorkspaceContext:
		"ee6e3a0ed6c014c6b187cd34cbaca00060abc724b6bc06bb0bf42e80767f80ff",
	refreshGitlabWorkspacePrefix:
		"eec26ff0f8cbe2ffd6b1ddbcd336aeeaaa72193625c9df1ac54678d7790e52b1",
};

function allowedReads(rel: string, content: string): Set<number> {
	const file = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true);
	const allowed = new Set<number>();
	const bindings = new Map<string, number>();
	const columns: ts.PropertyAccessExpression[] = [];
	function countBinding(name: ts.BindingName) {
		if (ts.isIdentifier(name))
			bindings.set(name.text, (bindings.get(name.text) ?? 0) + 1);
		else
			for (const item of name.elements)
				if (ts.isBindingElement(item)) countBinding(item.name);
	}
	function visit(node: ts.Node) {
		if (ts.isVariableDeclaration(node) || ts.isParameter(node))
			countBinding(node.name);
		if (
			(ts.isFunctionDeclaration(node) ||
				ts.isFunctionExpression(node) ||
				ts.isClassDeclaration(node) ||
				ts.isClassExpression(node) ||
				ts.isEnumDeclaration(node)) &&
			node.name
		)
			countBinding(node.name);
		if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node))
			countBinding(node.name);
		if (ts.isImportClause(node) && node.name) countBinding(node.name);
		if (ts.isImportEqualsDeclaration(node)) countBinding(node.name);
		if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name))
			countBinding(node.name);
		if (
			ts.isPropertyAccessExpression(node) &&
			/^(repoOwner|repoName)$/.test(node.name.text)
		)
			columns.push(node);
		ts.forEachChild(node, visit);
	}
	visit(file);
	const modulePath = (module: string) =>
		resolve(dirname(resolve(HOST_SERVICE_SRC, rel)), module).replace(
			/\.[jt]s$/,
			"",
		);
	function imported(local: string, exported: string, module: string): boolean {
		if (bindings.get(local) !== 1) return false;
		return file.statements.some((statement) => {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				!statement.importClause ||
				statement.importClause.isTypeOnly
			)
				return false;
			const from = statement.moduleSpecifier.text;
			if (
				module.startsWith("/") ? modulePath(from) !== module : from !== module
			)
				return false;
			const named = statement.importClause.namedBindings;
			return named && ts.isNamedImports(named)
				? named.elements.some(
						(item) =>
							!item.isTypeOnly &&
							item.name.text === local &&
							(item.propertyName ?? item.name).text === exported,
					)
				: false;
		});
	}
	const genuineSchema = (name: string) =>
		imported(name, "pullRequests", resolve(HOST_SERVICE_SRC, "db/schema"));
	for (const column of columns) {
		if (
			!ts.isIdentifier(column.expression) ||
			!genuineSchema(column.expression.text)
		)
			continue;
		const parent = column.parent;
		const eqColumn =
			ts.isCallExpression(parent) &&
			parent.arguments[0] === column &&
			ts.isIdentifier(parent.expression) &&
			imported(parent.expression.text, "eq", "drizzle-orm");
		const sql =
			ts.isTemplateSpan(parent) && ts.isTemplateExpression(parent.parent)
				? parent.parent.parent
				: undefined;
		const sqlColumn =
			sql &&
			ts.isTaggedTemplateExpression(sql) &&
			ts.isIdentifier(sql.tag) &&
			imported(sql.tag.text, "sql", "drizzle-orm");
		if (eqColumn || sqlColumn) allowed.add(column.name.getStart(file));
	}
	const functionNode = (name: string) =>
		file.statements.find(
			(statement): statement is ts.FunctionDeclaration =>
				ts.isFunctionDeclaration(statement) && statement.name?.text === name,
		);
	const adapter = functionNode("gitLabWorkspaceContext");
	const validator = functionNode("gitLabActionContext");
	if (
		rel === "trpc/router/git/gitlab-actions.ts" &&
		adapter &&
		validator &&
		bindings.get("gitLabActionContext") === 1 &&
		fingerprint(adapter.getText(file)) ===
			EXPECTED_BINDING_NODES.gitLabWorkspaceContext &&
		fingerprint(validator.getText(file)) ===
			EXPECTED_BINDING_NODES.gitLabActionContext &&
		imported(
			"resolveRepo",
			"resolveRepo",
			resolve(
				HOST_SERVICE_SRC,
				"trpc/router/workspace-creation/shared/project-helpers",
			),
		) &&
		imported(
			"gitLabClient",
			"gitLabClient",
			resolve(
				HOST_SERVICE_SRC,
				"trpc/router/pull-requests/procedures/gitlab-project",
			),
		)
	) {
		for (const column of columns) {
			const property = column.parent;
			const object = property.parent;
			const call = object.parent;
			if (
				column.getStart(file) >= adapter.getStart(file) &&
				column.end <= adapter.end &&
				ts.isIdentifier(column.expression) &&
				column.expression.text === "pr" &&
				ts.isPropertyAssignment(property) &&
				ts.isObjectLiteralExpression(object) &&
				ts.isCallExpression(call) &&
				call.arguments[1] === object &&
				ts.isIdentifier(call.expression) &&
				call.expression.text === "gitLabActionContext"
			)
				allowed.add(column.name.getStart(file));
		}
	}
	const refresh = functionNode("refreshGitlabWorkspace");
	if (
		rel === "trpc/router/workspaces/create-gitlab-checkout.ts" &&
		refresh?.body &&
		refresh.parameters
			.map((parameter) => parameter.name.getText(file))
			.join(",") === "ctx,git,checkout,workspace,projectId" &&
		fingerprint(
			refresh.body.statements
				.slice(0, 3)
				.map((statement) => statement.getText(file))
				.join("\n"),
		) === EXPECTED_BINDING_NODES.refreshGitlabWorkspacePrefix &&
		genuineSchema("pullRequests") &&
		imported("eq", "eq", "drizzle-orm") &&
		imported("TRPCError", "TRPCError", "@trpc/server")
	) {
		const outer = refresh.body.statements[2];
		if (outer && ts.isIfStatement(outer) && ts.isBlock(outer.thenStatement)) {
			const mismatch = outer.thenStatement.statements[1];
			if (mismatch && ts.isIfStatement(mismatch))
				for (const column of columns) {
					if (
						column.getStart(file) >= mismatch.expression.getStart(file) &&
						column.end <= mismatch.expression.end &&
						ts.isIdentifier(column.expression) &&
						column.expression.text === "linked"
					)
						allowed.add(column.name.getStart(file));
				}
		}
	}
	return allowed;
}

function scanContent(rel: string, content: string): Violation[] {
	const violations: Violation[] = [];
	const allowed = FORBIDDEN.test(content)
		? allowedReads(rel, content)
		: new Set<number>();
	let offset = 0;
	for (const [i, line] of content.split("\n").entries()) {
		const trimmed = line.trimStart();
		if (
			!trimmed.startsWith("//") &&
			!trimmed.startsWith("*") &&
			!trimmed.startsWith("/*")
		) {
			for (const match of line.matchAll(new RegExp(FORBIDDEN.source, "g"))) {
				if (!allowed.has(offset + match.index + 1))
					violations.push({ file: rel, line: i + 1, text: line.trim() });
			}
		}
		offset += line.length + 1;
	}
	return violations;
}

test("snapshot fields aren't read for GitHub queries outside the allowlist", async () => {
	const violations: Array<{ file: string; line: number; text: string }> = [];

	for await (const file of glob("**/*.ts", { cwd: HOST_SERVICE_SRC })) {
		const rel = file;
		// Tests routinely assert on cached fields; rule is for production code.
		if (rel.endsWith(".test.ts")) continue;
		if (ALLOWLIST.has(rel)) continue;

		const abs = resolve(HOST_SERVICE_SRC, rel);
		const content = readFileSync(abs, "utf8");
		violations.push(...scanContent(rel, content));
	}

	if (violations.length > 0) {
		const report = violations
			.map((v) => `  ${v.file}:${v.line}  ${v.text}`)
			.join("\n");
		throw new Error(
			[
				"Found snapshot-field reads outside the allowlist.",
				"",
				"GitHub queries must call `resolveGithubRepo(ctx, projectId)` to",
				"get owner/name from the live local git remote — not from the",
				"cached/cloud snapshot fields below:",
				"",
				report,
				"",
				`See ${relative(process.cwd(), import.meta.path)} for the rule.`,
			].join("\n"),
		);
	}

	expect(violations).toEqual([]);
});

const ACTIONS = "trpc/router/git/gitlab-actions.ts";
const CHECKOUT = "trpc/router/workspaces/create-gitlab-checkout.ts";
const LINKED = "trpc/router/pull-requests/procedures/get-linked-workspace.ts";
const source = (file: string) =>
	readFileSync(resolve(HOST_SERVICE_SRC, file), "utf8");
const sqlFixture = [
	'import {pullRequests} from "../../../../db/schema";',
	'import {eq, sql} from "drizzle-orm";',
	"const query = eq(pullRequests.repoOwner, live.owner);",
	`const label = sql\`lower(\${pullRequests.repoName})\`;`,
].join("\n");

test("genuine imported schema columns are SQL expressions, not cached routing", () => {
	expect(scanContent(LINKED, sqlFixture)).toEqual([]);
});
for (const file of [ACTIONS, CHECKOUT, LINKED]) {
	test(`reviewed exact expected-binding nodes pass: ${file}`, () => {
		expect(scanContent(file, source(file))).toEqual([]);
	});
}

for (const [name, content] of [
	[
		"wrong schema module",
		sqlFixture.replace("../../../../db/schema", "./fake-schema"),
	],
	[
		"fake schema object",
		sqlFixture.replace(
			'import {pullRequests} from "../../../../db/schema";',
			"const pullRequests = cached;",
		),
	],
	[
		"schema parameter shadow",
		`${sqlFixture}\nfunction shadow(pullRequests: unknown) {}`,
	],
	["schema catch shadow", `${sqlFixture}\ntry {} catch (pullRequests) {}`],
	[
		"local table alias",
		sqlFixture +
			"\nconst cachedAlias = pullRequests; query(cachedAlias.repoOwner);",
	],
	[
		"fake eq",
		sqlFixture.replace(
			'import {eq, sql} from "drizzle-orm";',
			'import {sql} from "drizzle-orm"; const eq = query;',
		),
	],
	[
		"schema destructuring shadow",
		`${sqlFixture}\nfunction shadow({pullRequests}: unknown) {}`,
	],
	["eq parameter shadow", `${sqlFixture}\nfunction shadow(eq: unknown) {}`],
	[
		"fake SQL import",
		sqlFixture.replace('from "drizzle-orm"', 'from "./fake-sql"'),
	],
	["SQL parameter shadow", `${sqlFixture}\nfunction shadow(sql: unknown) {}`],
	[
		"column used in provider routing",
		`${sqlFixture}\nprovider.query(pullRequests.repoOwner);`,
	],
	[
		"extra read on same line",
		sqlFixture.replace(
			"const query = eq(pullRequests.repoOwner, live.owner);",
			"const query = eq(pullRequests.repoOwner, live.owner); provider.query(cached.repoOwner);",
		),
	],
] as const) {
	test(`cached-field guard rejects ${name}`, () => {
		expect(scanContent(LINKED, content).length).toBeGreaterThan(0);
	});
}

for (const [name, file, before, after] of [
	["adapter expected URL omitted", ACTIONS, "expectedUrl: pr.url,", ""],
	[
		"adapter project guard omitted",
		ACTIONS,
		"if (!projectId || projectId !== pr.projectId) throw invalidIdentity();",
		"",
	],
	[
		"missing live remote validator",
		ACTIONS,
		"validateRemote(remote) {",
		"removedValidator(remote) {",
	],
	[
		"adapter no longer awaited",
		ACTIONS,
		"const action = await gitLabActionContext",
		"const action = gitLabActionContext",
	],
	["validator host check omitted", ACTIONS, "remote.host !== host ||", ""],
	[
		"resolver parameter shadow",
		ACTIONS,
		"export async function gitLabWorkspaceContext(",
		"function shadow(resolveRepo: unknown) {}\nexport async function gitLabWorkspaceContext(",
	],
	[
		"resolver no longer awaited",
		ACTIONS,
		"const repo = await resolveRepo",
		"const repo = resolveRepo",
	],
	[
		"fake resolver import",
		ACTIONS,
		"../workspace-creation/shared/project-helpers",
		"./fake-resolver",
	],
	[
		"cached API routing",
		ACTIONS,
		"owner: pr.repoOwner,",
		"owner: provider.query(pr.repoOwner),",
	],
	[
		"cached row alias",
		ACTIONS,
		"owner: pr.repoOwner,",
		"owner: alias.repoOwner,",
	],
	[
		"refresh conflict removed",
		CHECKOUT,
		'throw new TRPCError({ code: "CONFLICT" });\n\t\tverifiedExistingCheckout = true;',
		'console.log("mismatch");\n\t\tverifiedExistingCheckout = true;',
	],
	[
		"refresh wrong project check",
		CHECKOUT,
		'linked.projectId !== projectId ||\n\t\t\tlinked.repoProvider !== "gitlab"',
		'false ||\n\t\t\tlinked.repoProvider !== "gitlab"',
	],
	[
		"refresh fake conflict class",
		CHECKOUT,
		'from "@trpc/server"',
		'from "./fake-trpc"',
	],
	[
		"refresh mutation before validation",
		CHECKOUT,
		"if (workspace.projectId !== projectId)",
		"await bindGitlabCheckoutCredentials(ctx, git, checkout);\n\tif (workspace.projectId !== projectId)",
	],
	[
		"refresh cached API routing",
		CHECKOUT,
		"linked.repoOwner !== checkout.repo.owner",
		"provider.query(linked.repoOwner) !== checkout.repo.owner",
	],
] as const) {
	test(`expected-binding guard rejects ${name}`, () => {
		const current = source(file);
		expect(current.includes(before)).toBe(true);
		expect(
			scanContent(file, current.replace(before, after)).length,
		).toBeGreaterThan(0);
	});
}

test("an extra read in the same expected-binding function still fails", () => {
	const current = source(ACTIONS).replace(
		"owner: pr.repoOwner,",
		"owner: pr.repoOwner, extra: cached.repoName,",
	);
	expect(
		scanContent(ACTIONS, current).some((v) =>
			v.text.includes("cached.repoName"),
		),
	).toBe(true);
});

test("genuine renamed imported bindings retain SQL ownership", () => {
	const content = sqlFixture
		.replace("{pullRequests}", "{pullRequests as table}")
		.replaceAll("pullRequests.", "table.")
		.replace("{eq, sql}", "{eq as equal, sql as tagged}")
		.replace("eq(", "equal(")
		.replace("sql`", "tagged`");
	expect(scanContent(LINKED, content)).toEqual([]);
});

test("moving a reviewed row read to another function still fails", () => {
	const content =
		source(ACTIONS) +
		"\nfunction route(pr: unknown) { return provider.query(pr.repoOwner); }";
	expect(
		scanContent(ACTIONS, content).some((v) =>
			v.text.includes("provider.query"),
		),
	).toBe(true);
});

test("ordinary cached GitHub routing remains forbidden", () => {
	expect(
		scanContent(
			"trpc/router/pull-requests/procedures/new-query.ts",
			"return provider.query(project.repoOwner, project.repoName, cloudProject.repoCloneUrl);",
		),
	).toHaveLength(3);
});

test("a permitted SQL access cannot hide a second forbidden access on its line", () => {
	const content = sqlFixture.replace(
		"const query = eq(pullRequests.repoOwner, live.owner);",
		"const query = eq(pullRequests.repoOwner, live.owner); route(cached.repoOwner);",
	);
	expect(scanContent(LINKED, content)).toEqual([
		{
			file: LINKED,
			line: 3,
			text: "const query = eq(pullRequests.repoOwner, live.owner); route(cached.repoOwner);",
		},
	]);
});

for (const declaration of [
	'import pullRequests = require("./fake-schema");',
	'namespace pullRequests { export const repoOwner = "cached"; }',
]) {
	test(`conservative imported-column shadow rejection: ${declaration}`, () => {
		expect(
			scanContent(LINKED, `${sqlFixture}\n${declaration}`).length,
		).toBeGreaterThan(0);
	});
}
