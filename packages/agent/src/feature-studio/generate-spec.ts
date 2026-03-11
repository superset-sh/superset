import { superagent } from "../superagent";

export interface GenerateFeatureStudioSpecInput {
	title: string;
	rawPrompt: string;
	rulesetReference?: string;
}

export async function generateFeatureStudioSpec(
	input: GenerateFeatureStudioSpecInput,
) {
	const output = await superagent.generate([
		{
			role: "user",
			content: [
				{
					type: "text",
					text: [
						"Generate a reusable feature spec for Superbuilder.",
						`Title: ${input.title}`,
						`Rules reference: ${input.rulesetReference ?? "Not provided"}`,
						"",
						"User intent:",
						input.rawPrompt,
						"",
						"Return concise markdown with sections for goal, scope, UX, data, constraints, and acceptance criteria.",
					].join("\n"),
				},
			],
		},
	]);

	const spec = output.text.trim();
	if (!spec) {
		throw new Error("Feature Studio spec generation returned empty output");
	}

	return spec;
}
