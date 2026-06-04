/**
 * Demo: show what buildLaunchContext + buildLaunchSpec produce for various
 * canonical inputs, across all built-in agents.
 *
 * Not a test — manual eyeball tool for template iteration before the V2
 * modal wire-up lands (step 9).
 *
 * Run: bun run scripts/demo-launch-spec.ts
 *   or: bun run scripts/demo-launch-spec.ts claude
 *   or: bun run scripts/demo-launch-spec.ts codex cursor-agent
 */

import {
	indexResolvedAgentConfigs,
	resolveAgentConfigs,
} from "@superset/shared/agent-settings";
import { buildLaunchSpec } from "../src/shared/context/buildLaunchSpec";
import { buildLaunchContext } from "../src/shared/context/composer";
import { defaultContributorRegistry } from "../src/shared/context/contributors";
import type { LaunchSource, ResolveCtx } from "../src/shared/context/types";

// ---------------------------------------------------------------------------
// Stub resolvers (mirror what host-service/issues + task services would return)
// ---------------------------------------------------------------------------

const resolveCtx: ResolveCtx = {
	projectId: "demo-project",
	signal: new AbortController().signal,
	fetchIssue: async (url) => ({
		number: 123,
		url,
		title: "Auth middleware stores tokens in plaintext",
		body: "Legal flagged this last week. Sessions written to disk without encryption. We need to move to an encrypted KV before the compliance deadline.",
		slug: "auth-middleware-stores-tokens-in-plaintext",
	}),
	fetchPullRequest: async (url) => ({
		number: 200,
		url,
		title: "Rewrite auth middleware",
		body: "Replaces plaintext token storage with encrypted KV. Migrates existing sessions on first request.",
		branch: "fix/auth-encryption",
	}),
	fetchInternalTask: async (id) => ({
		id,
		slug: "refactor-auth",
		title: "Refactor auth middleware",
		description:
			"Split session-token storage from request handling so we can encrypt at rest. Keep the public API shape stable.",
	}),
};

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

interface Scenario {
	name: string;
	sources: LaunchSource[];
}

const SCENARIOS: Scenario[] = [
	{
		name: "plain prompt",
		sources: [
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "add e2e tests for the checkout flow" },
				],
			},
		],
	},
	{
		name: "prompt + linked issue",
		sources: [
			{
				kind: "user-prompt",
				content: [{ type: "text", text: "fix this" }],
			},
			{
				kind: "github-issue",
				url: "https://github.com/acme/repo/issues/123",
			},
		],
	},
	{
		name: "inline text + image + text (rich editor)",
		sources: [
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "look at this:" },
					{
						type: "image",
						data: new Uint8Array([137, 80, 78, 71]),
						mediaType: "image/png",
					},
					{ type: "text", text: "<- heres more text" },
				],
			},
		],
	},
	{
		name: "inline + issue (editor image between text with linked issue)",
		sources: [
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "look at this:" },
					{
						type: "image",
						data: new Uint8Array([137, 80, 78, 71]),
						mediaType: "image/png",
					},
					{ type: "text", text: "<- heres more text" },
				],
			},
			{ kind: "github-issue", url: "https://github.com/acme/repo/issues/123" },
		],
	},
	{
		name: "prompt + task + issue + PR + attachment",
		sources: [
			{
				kind: "user-prompt",
				content: [
					{ type: "text", text: "refactor the auth middleware end-to-end" },
				],
			},
			{ kind: "internal-task", id: "TASK-42" },
			{
				kind: "github-issue",
				url: "https://github.com/acme/repo/issues/123",
			},
			{
				kind: "github-pr",
				url: "https://github.com/acme/repo/pull/200",
			},
			{
				kind: "attachment",
				file: {
					data: new TextEncoder().encode(
						"2026-04-14 ERROR auth.ts:42 token decrypt failed\n",
					),
					mediaType: "text/plain",
					filename: "logs.txt",
				},
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const requestedAgentsArg = process.argv.slice(2);
const configs = indexResolvedAgentConfigs(resolveAgentConfigs({}));
const requestedAgents =
	requestedAgentsArg.length > 0
		? requestedAgentsArg
		: ["claude", "codex", "cursor-agent"];

function divider(char = "=", n = 72): string {
	return char.repeat(n);
}

function indent(text: string, prefix = "  "): string {
	return text
		.split("\n")
		.map((line) => prefix + line)
		.join("\n");
}

for (const scenario of SCENARIOS) {
	console.log(`\n${divider("=")}`);
	console.log(`SCENARIO: ${scenario.name}`);
	console.log(divider("="));

	const ctx = await buildLaunchContext(
		{
			projectId: "demo-project",
			sources: scenario.sources,
			agent: { id: "claude" },
		},
		{ contributors: defaultContributorRegistry, resolveCtx },
	);

	if (ctx.failures.length > 0) {
		console.log("FAILURES:");
		for (const f of ctx.failures) console.log(`  - ${f.error}`);
	}

	for (const agentId of requestedAgents) {
		const config = configs.get(agentId as never);
		if (!config) {
			console.log(`\n[skip] ${agentId} — not a known agent`);
			continue;
		}

		const spec = buildLaunchSpec({ ...ctx, agent: { id: config.id } }, config);
		console.log(`\n${divider("-")}`);
		console.log(`AGENT: ${config.label} (${config.id})`);
		console.log(divider("-"));

		if (!spec) {
			console.log("(null — no agent)");
			continue;
		}

		console.log(`taskSlug: ${spec.taskSlug ?? "(none)"}`);
		console.log(`system parts: ${spec.system.length}`);
		console.log(`user parts:   ${spec.user.length}`);
		console.log(
			`attachments:  ${spec.attachments.length} (${
				spec.attachments.map((p) => p.type).join(", ") || "none"
			})`,
		);

		if (spec.system.length > 0) {
			console.log("\n[SYSTEM]");
			for (const part of spec.system) {
				if (part.type === "text") console.log(indent(part.text));
			}
		}

		if (spec.user.length > 0) {
			console.log("\n[USER]");
			for (const part of spec.user) {
				if (part.type === "text") {
					console.log(indent(part.text));
				} else if (part.type === "image") {
					console.log(
						indent(`<image: ${part.mediaType}, ${part.data.length} bytes>`),
					);
				} else if (part.type === "file") {
					console.log(
						indent(
							`<file: ${part.filename ?? "(unnamed)"}, ${part.mediaType}, ${part.data.length} bytes>`,
						),
					);
				}
			}
		}
	}
}

console.log("\n");
