import { superagent } from "../superagent";

export interface GenerateFeatureStudioPlanInput {
	title: string;
	rawPrompt: string;
	spec: string;
	rulesetReference?: string;
}

export async function generateFeatureStudioPlan(
	input: GenerateFeatureStudioPlanInput,
) {
	const output = await superagent.generate([
		{
			role: "user",
			content: [
				{
					type: "text",
					text: [
						"Create an implementation plan for a Superbuilder feature request.",
						`Title: ${input.title}`,
						`Rules reference: ${input.rulesetReference ?? "Not provided"}`,
						"",
						"Original request:",
						input.rawPrompt,
						"",
						"Approved spec:",
						input.spec,
						"",
						"Return markdown with implementation phases, likely files, tests, rollout risks, and verification steps.",
					].join("\n"),
				},
			],
		},
	]);

	const plan = output.text.trim();
	if (!plan) {
		throw new Error("Feature Studio plan generation returned empty output");
	}

	return plan;
}
