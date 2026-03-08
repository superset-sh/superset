export const SUPERSET_PROJECT_CONFIG_CLI = "superset-project-config";

export const DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE = `You were just launched in a fresh Superset workspace for a newly opened project.

Before you start implementation work, configure this project for Superset by interviewing the user. Ask only the questions needed to figure out the setup commands that should run when a workspace is created and any teardown commands that should run when it is deleted.

Inspect the current configuration with:
{{show_command}}

Save the shared project configuration with:
{{write_command}}

Write the shared project configuration at {{project_root}}/.superset/config.json, not a workspace-local copy.

After the configuration is saved, summarize the resulting setup and teardown behavior for the user and then continue with their original request if they have one:
{{user_request}}`;

export interface RenderProjectConfigurationLaunchPromptOptions {
	template?: string | null;
	userRequest?: string | null;
	projectRoot?: string;
}

export function getProjectConfigurationCliCommands(
	projectRoot = "$SUPERSET_ROOT_PATH",
) {
	return {
		show: `${SUPERSET_PROJECT_CONFIG_CLI} show --project-root "${projectRoot}"`,
		write: `${SUPERSET_PROJECT_CONFIG_CLI} write --project-root "${projectRoot}" --setup-json '["bun install","bun run dev"]' --teardown-json '["docker compose down"]'`,
	};
}

export function renderProjectConfigurationLaunchPrompt({
	template,
	userRequest,
	projectRoot = "$SUPERSET_ROOT_PATH",
}: RenderProjectConfigurationLaunchPromptOptions = {}): string {
	const { show, write } = getProjectConfigurationCliCommands(projectRoot);
	const resolvedTemplate =
		template?.trim() || DEFAULT_PROJECT_CONFIGURATION_LAUNCH_PROMPT_TEMPLATE;
	const resolvedUserRequest =
		userRequest?.trim() || "No additional request was provided.";

	return resolvedTemplate
		.replaceAll("{{show_command}}", show)
		.replaceAll("{{write_command}}", write)
		.replaceAll("{{project_root}}", projectRoot)
		.replaceAll("{{user_request}}", resolvedUserRequest);
}
