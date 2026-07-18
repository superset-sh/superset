/**
 * The "gym" — a disposable fixture repository for real-Claude E2E runs.
 *
 * Layout and contents are pinned by the E2E User Story in
 * plans/host-sessions-sync.md ("The gym project"): every file exists so a
 * specific harness behavior can be exercised and asserted with exact
 * sentinels. Keep the fixture ids and sentinels in sync with that doc and
 * with acp-sessions.integration.test.ts (which uses the same workflow).
 */
import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const GYM_NOTES_CONTENT =
	"fixture_id=sonnet-workflow\nvalues=13,29\nexpected_sum=42\n";

export const GYM_WORKFLOW_NAME = "acp-e2e-dummy";

/** Printed by scripts/ok.sh; replies quoting the script output contain it. */
export const GYM_SCRIPT_SENTINEL = "GYM_SCRIPT_OK";

/** The gym-check skill instructs the model to reply with exactly this. */
export const GYM_SKILL_SENTINEL = "GYM_CHECK_OK 42";

export const GYM_WORKFLOW_SOURCE = `export const meta = {
  name: "acp-e2e-dummy",
  description: "Run a multi-agent inspect, analyze, audit, and verify workflow",
  phases: [
    { title: "Inspect", detail: "Parse the fixture through a subagent" },
    { title: "Analyze", detail: "Derive an independent proof" },
    { title: "Audit", detail: "Cross-check the source and proof in parallel" },
    { title: "Verify", detail: "Converge on a structured verdict" },
  ],
}

phase("Inspect")
const inspected = await agent(
  "Read notes.txt. Return its fixture_id, the two integer values, and their computed sum. Do not modify files and do not use Bash.",
  {
    label: "inspect-fixture",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["fixtureId", "values", "sum"],
      properties: {
        fixtureId: { type: "string" },
        values: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
        sum: { type: "integer" },
      },
    },
  },
)

phase("Analyze")
const analyzed = await agent(
  "Using this inspected data: " + JSON.stringify(inspected) +
    ", independently read notes.txt, verify it matches, and derive the sum, product, and the exact equation 13 + 29 = 42. Do not modify files and do not use Bash.",
  {
    label: "derive-proof",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["fixtureId", "sum", "product", "equation"],
      properties: {
        fixtureId: { type: "string" },
        sum: { type: "integer" },
        product: { type: "integer" },
        equation: { type: "string" },
      },
    },
  },
)

phase("Audit")
const audits = await pipeline(["source", "arithmetic"], angle =>
  agent(
    "Independently audit the " + angle +
      " side of this fixture. Read notes.txt and cross-check inspected=" +
      JSON.stringify(inspected) + ", analyzed=" + JSON.stringify(analyzed) +
      ". Verify fixtureId sonnet-workflow, values 13 and 29, sum 42, product 377, and equation 13 + 29 = 42. Report concrete evidence. Do not modify files and do not use Bash.",
    {
      label: "audit-" + angle,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["angle", "passed", "evidence"],
        properties: {
          angle: { type: "string" },
          passed: { type: "boolean" },
          evidence: { type: "string" },
        },
      },
    },
  ),
)

phase("Verify")
const verified = await agent(
  "Act as the final verifier. Read notes.txt. Cross-check these prior results: inspected=" +
    JSON.stringify(inspected) + ", analyzed=" + JSON.stringify(analyzed) +
    ", audits=" + JSON.stringify(audits) +
    ". Return valid only when both audits passed, fixtureId is sonnet-workflow, values are 13 and 29, sum is 42, product is 377, and the equation is exact. When valid, set marker exactly WORKFLOW_VERIFIED. Do not modify files and do not use Bash.",
  {
    label: "verify-proof",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["valid", "fixtureId", "sum", "auditCount", "marker"],
      properties: {
        valid: { type: "boolean" },
        fixtureId: { type: "string" },
        sum: { type: "integer" },
        auditCount: { type: "integer" },
        marker: { type: "string" },
      },
    },
  },
)

return { inspected, analyzed, audits, verified }
`;

const GYM_SKILL_SOURCE = `---
name: gym-check
description: Verify the gym fixture notes.txt and report its sentinel. Use when asked to run the gym check.
---

# Gym check

1. Read \`notes.txt\` in the workspace root.
2. If it contains \`expected_sum=42\`, reply with exactly \`${GYM_SKILL_SENTINEL}\`.
3. If it does not, reply with exactly \`GYM_CHECK_BROKEN\`.
4. Do not modify any files.
`;

const GYM_OK_SCRIPT = `#!/bin/sh
echo ${GYM_SCRIPT_SENTINEL}
`;

const GYM_README = `# Gym fixture

Disposable workspace for Superset harness E2E runs. Nothing here is real
product code; every file exists to exercise one harness behavior.
`;

/**
 * Provision a fresh gym repository in a temp directory and return its path.
 * Callers own cleanup (rmSync recursive) after disposing the manager.
 */
export function provisionGym(prefix = "acp-gym-"): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
	writeFileSync(path.join(dir, "notes.txt"), GYM_NOTES_CONTENT);
	writeFileSync(path.join(dir, "README.md"), GYM_README);

	const scriptsDir = path.join(dir, "scripts");
	mkdirSync(scriptsDir, { recursive: true });
	const okScript = path.join(scriptsDir, "ok.sh");
	writeFileSync(okScript, GYM_OK_SCRIPT);
	chmodSync(okScript, 0o755);

	const workflowsDir = path.join(dir, ".claude", "workflows");
	mkdirSync(workflowsDir, { recursive: true });
	writeFileSync(
		path.join(workflowsDir, `${GYM_WORKFLOW_NAME}.js`),
		GYM_WORKFLOW_SOURCE,
	);

	const skillDir = path.join(dir, ".claude", "skills", "gym-check");
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(path.join(skillDir, "SKILL.md"), GYM_SKILL_SOURCE);

	execSync(
		"git init -q && git add -A && git -c user.email=gym@superset.sh -c user.name=gym commit -qm init",
		{ cwd: dir },
	);
	return dir;
}
