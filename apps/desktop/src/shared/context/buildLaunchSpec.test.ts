import { describe, expect, test } from "bun:test";
import {
	indexResolvedAgentConfigs,
	type ResolvedAgentConfig,
	resolveAgentConfigs,
} from "@superset/shared/agent-settings";
import { launchContextMultiSource } from "./__fixtures__";
import { buildLaunchSpec } from "./buildLaunchSpec";
import type { AttachmentFile, LaunchContext } from "./types";

function getConfig(id: string): ResolvedAgentConfig {
	const configs = indexResolvedAgentConfigs(resolveAgentConfigs({}));
	const config = configs.get(id as never);
	if (!config) throw new Error(`agent not found: ${id}`);
	return config;
}

function baseCtx(overrides: Partial<LaunchContext> = {}): LaunchContext {
	return {
		projectId: "p",
		sources: [],
		sections: [],
		failures: [],
		agent: { id: "claude" },
		...overrides,
	};
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);
const TXT_ATTACHMENT: AttachmentFile = {
	data: new Uint8Array([1, 2, 3]),
	mediaType: "text/plain",
	filename: "logs.txt",
};

describe("buildLaunchSpec", () => {
	test("returns null when agent.id is 'none'", () => {
		const spec = buildLaunchSpec(baseCtx({ agent: { id: "none" } }), undefined);
		expect(spec).toBeNull();
	});

	test("returns null when agentConfig is missing", () => {
		const spec = buildLaunchSpec(baseCtx(), undefined);
		expect(spec).toBeNull();
	});

	test("agentId + taskSlug flow through", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				taskSlug: "refactor-auth",
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [{ type: "text", text: "hello" }],
					},
				],
			}),
			getConfig("claude"),
		);
		expect(spec?.agentId).toBe("claude");
		expect(spec?.taskSlug).toBe("refactor-auth");
	});

	test("all builtin agents share the default markdown template (no XML)", () => {
		const section = {
			id: "user-prompt",
			kind: "user-prompt" as const,
			label: "Prompt",
			content: [
				{ type: "text" as const, text: "refactor the auth middleware" },
			],
		};
		const claudeSpec = buildLaunchSpec(
			baseCtx({ sections: [section] }),
			getConfig("claude"),
		);
		const codexSpec = buildLaunchSpec(
			baseCtx({ sections: [section], agent: { id: "codex" } }),
			getConfig("codex"),
		);
		const claudeText = (claudeSpec?.user[0] as { type: "text"; text: string })
			.text;
		const codexText = (codexSpec?.user[0] as { type: "text"; text: string })
			.text;
		expect(claudeText).toBe("refactor the auth middleware");
		expect(claudeText).toBe(codexText);
		expect(claudeText).not.toContain("<user-request>");
	});

	test("empty system template produces empty system content array", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [{ type: "text", text: "hi" }],
					},
				],
			}),
			getConfig("claude"),
		);
		expect(spec?.system).toEqual([]);
	});

	test("issues section body is dropped into {{issues}} variable", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [{ type: "text", text: "refactor" }],
					},
					{
						id: "issue:123",
						kind: "github-issue",
						label: "Issue #123 — Auth",
						content: [
							{
								type: "text",
								text: "# Auth\n\nLegal flagged this.",
							},
						],
					},
				],
			}),
			getConfig("codex"),
		);
		const userText = (spec?.user[0] as { type: "text"; text: string }).text;
		expect(userText).toContain("refactor");
		expect(userText).toContain("# Auth");
		expect(userText).toContain("Legal flagged this.");
	});

	test("multiple tasks of the same kind join with a separator", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [{ type: "text", text: "plan" }],
					},
					{
						id: "task:T-1",
						kind: "internal-task",
						label: "Task T-1",
						content: [{ type: "text", text: "# T-1\n\nOne." }],
					},
					{
						id: "task:T-2",
						kind: "internal-task",
						label: "Task T-2",
						content: [{ type: "text", text: "# T-2\n\nTwo." }],
					},
				],
			}),
			getConfig("codex"),
		);
		const userText = (spec?.user[0] as { type: "text"; text: string }).text;
		expect(userText).toContain("# T-1");
		expect(userText).toContain("# T-2");
		expect(userText.indexOf("T-1")).toBeLessThan(userText.indexOf("T-2"));
	});

	test("attachment sections are listed in {{attachments}} + file parts collected separately", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [{ type: "text", text: "fix the bug" }],
					},
					{
						id: "attachment:logs.txt",
						kind: "attachment",
						label: "logs.txt",
						content: [
							{
								type: "file",
								data: TXT_ATTACHMENT.data,
								mediaType: TXT_ATTACHMENT.mediaType,
								filename: TXT_ATTACHMENT.filename,
							},
						],
					},
					{
						id: "attachment:screen.png",
						kind: "attachment",
						label: "screen.png",
						content: [
							{ type: "image", data: PNG_BYTES, mediaType: "image/png" },
						],
					},
				],
			}),
			getConfig("codex"),
		);
		const userText = (spec?.user[0] as { type: "text"; text: string }).text;
		expect(userText).toContain(".superset/attachments/logs.txt");
		expect(userText).toContain(".superset/attachments/screen.png");
		expect(spec?.attachments).toHaveLength(2);
		expect(spec?.attachments[0]?.type).toBe("file");
		expect(spec?.attachments[1]?.type).toBe("image");
	});

	test("inline non-text parts from user-prompt stay inline in spec.user", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [
							{ type: "text", text: "see this:" },
							{ type: "image", data: PNG_BYTES, mediaType: "image/png" },
							{ type: "text", text: "and fix" },
						],
					},
				],
			}),
			getConfig("codex"),
		);

		// Inline order preserved: text, image, text reach the agent in sequence
		// so chat agents render the image between the two text chunks.
		expect(spec?.user).toHaveLength(3);
		expect(spec?.user[0]).toEqual({ type: "text", text: "see this:" });
		expect(spec?.user[1]).toEqual({
			type: "image",
			data: PNG_BYTES,
			mediaType: "image/png",
		});
		expect(spec?.user[2]?.type).toBe("text");
		expect((spec?.user[2] as { type: "text"; text: string }).text).toContain(
			"and fix",
		);

		// Explicit attachment-kind sections land in spec.attachments; inline
		// user-prompt parts do not.
		expect(spec?.attachments).toEqual([]);
	});

	test("inline non-text parts still appear in the {{attachments}} list for CLIs", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [
							{ type: "text", text: "check this log:" },
							{
								type: "file",
								data: new Uint8Array([1, 2]),
								mediaType: "text/plain",
								filename: "trace.log",
							},
						],
					},
				],
			}),
			getConfig("codex"),
		);
		const lastText = (
			spec?.user[spec.user.length - 1] as { type: "text"; text: string }
		)?.text;
		// Attachments list renders after the inline parts so a CLI agent
		// reading just the flattened text still has the file path reference.
		expect(lastText).toContain(".superset/attachments/trace.log");
	});

	test("empty userPrompt still renders system = [] and drops empty user template cleanly", () => {
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "issue:1",
						kind: "github-issue",
						label: "Issue #1",
						content: [{ type: "text", text: "# Issue\n\nbody" }],
					},
				],
			}),
			getConfig("codex"),
		);
		const userText = (spec?.user[0] as { type: "text"; text: string }).text;
		expect(userText).toContain("# Issue");
		expect(userText).not.toMatch(/^\n/);
		expect(userText).not.toMatch(/\n$/);
	});

	test("no sections at all yields empty system + empty user", () => {
		const spec = buildLaunchSpec(baseCtx(), getConfig("codex"));
		expect(spec?.system).toEqual([]);
		expect(spec?.user).toEqual([]);
		expect(spec?.attachments).toEqual([]);
	});

	test("canonical multi-source fixture → claude XML spec (snapshot)", () => {
		const spec = buildLaunchSpec(launchContextMultiSource, getConfig("claude"));
		expect({
			agentId: spec?.agentId,
			system: spec?.system,
			userText: (spec?.user[0] as { type: "text"; text: string })?.text,
			attachmentKinds: spec?.attachments.map((p) => p.type),
			taskSlug: spec?.taskSlug,
		}).toMatchInlineSnapshot(`
{
  "agentId": "claude",
  "attachmentKinds": [
    "file",
    "image",
  ],
  "system": [],
  "taskSlug": "refactor-auth",
  "userText": 
"refactor the auth middleware

# Refactor auth middleware

Split session-token storage from request handling so we can encrypt at rest.

# Auth middleware stores tokens in plaintext

Legal flagged this. Sessions written to disk without encryption.

# Rotate session tokens on password change

Follow-up for #123.

# Rewrite auth middleware

Branch: \`fix/auth-encryption\`

Replaces plaintext token storage with encrypted KV.

# Attached files

The user attached these files alongside the prompt. They've been
written into the worktree at \`.superset/attachments/\`. Read them
to understand the request — they're part of the task, not
optional reference.

- .superset/attachments/logs.txt
- .superset/attachments/screenshot.png"
,
}
`);
	});

	test("canonical multi-source fixture → codex markdown spec (snapshot)", () => {
		const spec = buildLaunchSpec(launchContextMultiSource, getConfig("codex"));
		expect({
			agentId: spec?.agentId,
			userText: (spec?.user[0] as { type: "text"; text: string })?.text,
			attachmentKinds: spec?.attachments.map((p) => p.type),
			taskSlug: spec?.taskSlug,
		}).toMatchInlineSnapshot(`
{
  "agentId": "claude",
  "attachmentKinds": [
    "file",
    "image",
  ],
  "taskSlug": "refactor-auth",
  "userText": 
"refactor the auth middleware

# Refactor auth middleware

Split session-token storage from request handling so we can encrypt at rest.

# Auth middleware stores tokens in plaintext

Legal flagged this. Sessions written to disk without encryption.

# Rotate session tokens on password change

Follow-up for #123.

# Rewrite auth middleware

Branch: \`fix/auth-encryption\`

Replaces plaintext token storage with encrypted KV.

# Attached files

The user attached these files alongside the prompt. They've been
written into the worktree at \`.superset/attachments/\`. Read them
to understand the request — they're part of the task, not
optional reference.

- .superset/attachments/logs.txt
- .superset/attachments/screenshot.png"
,
}
`);
	});

	test("agent-side template override replaces the user template", () => {
		const configs = resolveAgentConfigs({
			overrideEnvelope: {
				version: 1,
				presets: [
					{
						id: "claude",
						contextPromptTemplateUser: "CUSTOM {{userPrompt}} END",
					},
				],
			},
		});
		const claude = indexResolvedAgentConfigs(configs).get("claude");
		if (!claude) throw new Error("claude missing");
		const spec = buildLaunchSpec(
			baseCtx({
				sections: [
					{
						id: "user-prompt",
						kind: "user-prompt",
						label: "Prompt",
						content: [{ type: "text", text: "hi" }],
					},
				],
			}),
			claude,
		);
		const userText = (spec?.user[0] as { type: "text"; text: string }).text;
		expect(userText).toBe("CUSTOM hi END");
	});
});
