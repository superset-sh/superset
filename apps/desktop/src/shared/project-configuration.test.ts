import { describe, expect, it } from "bun:test";
import {
	DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE,
	renderProjectConfigurationLaunchPrompt,
	SUPERSET_PROJECT_CONFIG_CLI,
} from "./project-configuration";

describe("renderProjectConfigurationLaunchPrompt", () => {
	it("renders the default template with CLI commands and user request", () => {
		const prompt = renderProjectConfigurationLaunchPrompt({
			userRequest: "Help me get the app running locally.",
		});

		expect(prompt).toContain(
			DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE.split("\n")[0],
		);
		expect(prompt).toContain(
			`${SUPERSET_PROJECT_CONFIG_CLI} show --project-root "$SUPERSET_ROOT_PATH"`,
		);
		expect(prompt).toContain(
			`${SUPERSET_PROJECT_CONFIG_CLI} write --project-root "$SUPERSET_ROOT_PATH"`,
		);
		expect(prompt).toContain("Help me get the app running locally.");
		expect(prompt).not.toContain("{{show_command}}");
	});

	it("falls back when no user request is provided", () => {
		const prompt = renderProjectConfigurationLaunchPrompt();

		expect(prompt).toContain("No additional request was provided.");
	});
});
