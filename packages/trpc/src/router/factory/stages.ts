import type { FactoryStage } from "@superset/db/schema";
import { z } from "zod";

/**
 * item.stage means "in / awaiting this stage". Success at a stage moves the
 * item to STAGE_FLOW[stage]; human_review is advanced by a human (or, in
 * phase 2, the PR-merged webhook), never by an agent report.
 */
export const STAGE_FLOW: Record<FactoryStage, FactoryStage | null> = {
	intake: "classify",
	classify: "analyze",
	analyze: "implement",
	implement: "review",
	review: "human_review",
	human_review: "verify",
	verify: "done",
	done: null,
	rejected: null,
};

/** Stages executed by a dispatched agent. */
export const AGENT_STAGES = [
	"classify",
	"analyze",
	"implement",
	"review",
	"verify",
] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

export function isAgentStage(stage: FactoryStage): stage is AgentStage {
	return (AGENT_STAGES as readonly string[]).includes(stage);
}

export const classifyResultSchema = z.object({
	kind: z.enum(["bug", "feature", "docs", "question", "other"]),
	confidence: z.number().min(0).max(100),
	labels: z.array(z.string()).optional(),
});

export const analyzeResultSchema = z.object({
	feasible: z.boolean(),
	spec: z.string(),
	backwardCompatible: z.boolean().optional(),
	risks: z.string().optional(),
});

export const implementResultSchema = z.object({
	prNumber: z.number().int().positive(),
	prUrl: z.string().url(),
	summary: z.string(),
	testEvidence: z.string().optional(),
});

export const reviewResultSchema = z.object({
	verdict: z.enum(["approve", "request_changes", "reject"]),
	riskScore: z.number().min(0).max(100),
	findings: z.string().optional(),
});

export const verifyResultSchema = z.object({
	verified: z.boolean(),
	notes: z.string().optional(),
});

export const STAGE_RESULT_SCHEMAS: Record<AgentStage, z.ZodTypeAny> = {
	classify: classifyResultSchema,
	analyze: analyzeResultSchema,
	implement: implementResultSchema,
	review: reviewResultSchema,
	verify: verifyResultSchema,
};

/**
 * Code-level defaults; a factory_stage_prompts row with status "active"
 * overrides. Behavior only — work-item context and the reporting protocol
 * are appended at dispatch (renderStageDispatchPrompt).
 */
export const DEFAULT_STAGE_PROMPTS: Record<AgentStage, string> = {
	classify: `You are the classification stage of a software factory pipeline.

Read the GitHub issue below (use \`gh issue view <number> --comments\`) and classify it:
- kind: bug | feature | docs | question | other
- confidence: 0-100
- labels: optional suggested labels

Skim the relevant code just enough to judge whether the report is plausible for this repo. Do not attempt a fix. Keep it fast.`,

	analyze: `You are the analysis stage of a software factory pipeline.

For the GitHub issue below (\`gh issue view <number> --comments\`):
1. Reproduce or probe: for a bug, write a minimal failing probe (script or test) demonstrating it; for a feature, confirm it does not already exist.
2. Write a concrete implementation spec: files to touch, approach, API surface, test plan.
3. Assess backward compatibility and risks.

Report feasible=false with your reasoning if the issue is invalid, already fixed, or out of scope. Do not implement the fix.`,

	implement: `You are the implementation stage of a software factory pipeline.

Implement the spec from the analysis stage (included below) on the current branch:
- Follow the repo's conventions and lint/typecheck/test requirements.
- Add or update tests proving the change; run them and make them pass.
- Commit, push the branch, and open a draft PR with \`gh pr create --draft\` that references the issue ("Closes #<number>") and includes a test-plan section with real evidence.

Report the PR number and URL. If you cannot complete the implementation, report blocked with what stopped you.`,

	review: `You are the automated review stage of a software factory pipeline. You did not write this code; be skeptical.

Check out the PR below (\`gh pr checkout <number>\`) and review it:
- Re-run the build/tests independently; verify the claimed test evidence yourself.
- Score side-effect and backward-compatibility risk (0 = trivial, 100 = dangerous).
- Look for scope creep beyond the issue and for missing edge cases.

Post your findings as a PR review comment via \`gh pr review\` (comment, not approve), and report a verdict: approve | request_changes | reject.`,

	verify: `You are the post-merge verification stage of a software factory pipeline.

The PR below was merged. On the default branch, verify the original issue is actually resolved (re-run the analysis probe or the relevant tests). Report verified=true/false with notes.`,
};

const STAGE_REPORT_EXAMPLES: Record<AgentStage, string> = {
	classify: `{ "kind": "bug", "confidence": 85, "labels": ["area:terminal"] }`,
	analyze: `{ "feasible": true, "spec": "...", "backwardCompatible": true, "risks": "..." }`,
	implement: `{ "prNumber": 123, "prUrl": "https://github.com/owner/repo/pull/123", "summary": "...", "testEvidence": "..." }`,
	review: `{ "verdict": "approve", "riskScore": 20, "findings": "..." }`,
	verify: `{ "verified": true, "notes": "..." }`,
};

export interface ImprovePromptContext {
	stage: AgentStage;
	improveRunId: string;
	repoFullName: string;
	currentPrompt: string;
	flawedRuns: Array<{
		outcome: string | null;
		rationale: string | null;
		resultJson: unknown;
		feedbackNote: string | null;
		error: string | null;
	}>;
}

/** The self-learning meta-prompt: flawed runs in, draft prompt version out. */
export function renderImprovePrompt(ctx: ImprovePromptContext): string {
	const runs = ctx.flawedRuns
		.map((run, index) => {
			const parts = [
				`### Run ${index + 1} (${run.outcome ?? "unreported"})`,
				run.rationale ? `Agent rationale: ${run.rationale}` : null,
				run.resultJson != null
					? `Agent result:\n\`\`\`json\n${JSON.stringify(run.resultJson, null, 2)}\n\`\`\``
					: null,
				run.error ? `Error: ${run.error}` : null,
				run.feedbackNote ? `**Human feedback: ${run.feedbackNote}**` : null,
			];
			return parts.filter(Boolean).join("\n");
		})
		.join("\n\n");

	return `You are the prompt-improvement stage of a software factory pipeline for ${ctx.repoFullName}.

The "${ctx.stage}" stage agent runs with the prompt below, and humans have flagged the following runs as flawed. Your job: rewrite the stage prompt so those failures don't recur, without breaking what already works.

## Current ${ctx.stage} prompt
\`\`\`
${ctx.currentPrompt}
\`\`\`

## Flagged runs
${runs}

## Instructions
- Diagnose the pattern behind the human feedback; do not overfit a rule to a single run.
- Keep the prompt concise and behavioral. Preserve its role framing and output discipline.
- Change only what the evidence justifies; keep everything else verbatim where possible.

## Reporting (required — do this exactly once, as your final action)
Call the \`factory_propose_prompt\` MCP tool:
- improveRunId: "${ctx.improveRunId}"
- content: the full rewritten prompt text
- rationale: 1-3 sentences on what you changed and which feedback drove it

Your proposal becomes a DRAFT a human reviews — it never activates itself.

If the factory_propose_prompt MCP tool is not available in your session, report via the Superset CLI instead (write the prompt to a file first):
\`\`\`
superset factory propose-prompt --improve-run ${ctx.improveRunId} --content-file prompt.md --rationale "<1-3 sentences>"
\`\`\``;
}

export interface StagePromptContext {
	stagePrompt: string;
	stage: AgentStage;
	runId: string;
	itemId: string;
	expectedRevision: number;
	repoFullName: string;
	externalNumber: number;
	externalUrl: string;
	title: string;
	priorResults: Array<{ stage: string; resultJson: unknown }>;
}

export function renderStageDispatchPrompt(ctx: StagePromptContext): string {
	const prior = ctx.priorResults
		.map(
			(r) =>
				`### ${r.stage}\n\`\`\`json\n${JSON.stringify(r.resultJson, null, 2)}\n\`\`\``,
		)
		.join("\n\n");

	return `${ctx.stagePrompt}

## Work item
- Repo: ${ctx.repoFullName}
- Issue/PR: #${ctx.externalNumber} — ${ctx.title}
- URL: ${ctx.externalUrl}
${prior ? `\n## Prior stage results\n${prior}\n` : ""}
## Reporting (required — do this exactly once, as your final action)
Call the \`factory_report\` MCP tool:
- runId: "${ctx.runId}"
- itemId: "${ctx.itemId}"
- expectedRevision: ${ctx.expectedRevision}
- outcome: "success" if you completed the stage, "blocked" if something outside your control stopped you
- result (required on success), matching this shape for the ${ctx.stage} stage:
  ${STAGE_REPORT_EXAMPLES[ctx.stage]}
- rationale: 1-3 sentences on how you reached the result

If the tool rejects with a revision conflict, re-read the current state it returns and only retry if your work is still the pending one.

If the factory_report MCP tool is not available in your session, report via the Superset CLI instead (write the result JSON to a file first):
\`\`\`
superset factory report --run ${ctx.runId} --revision ${ctx.expectedRevision} --outcome success --result-file result.json --rationale "<1-3 sentences>"
\`\`\``;
}
