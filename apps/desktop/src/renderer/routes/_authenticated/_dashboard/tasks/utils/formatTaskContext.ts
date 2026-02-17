import type { TaskWithStatus } from "../components/TasksView/hooks/useTasksTable";

export function formatTaskContext({
	task,
	additionalContext,
}: {
	task: TaskWithStatus;
	additionalContext?: string;
}): string {
	const metadata = [
		`Priority: ${task.priority}`,
		task.status?.name && `Status: ${task.status.name}`,
		task.labels?.length && `Labels: ${task.labels.join(", ")}`,
	]
		.filter(Boolean)
		.join("\n");

	const additionalSection = additionalContext?.trim()
		? `\n## Additional Context\n\n${additionalContext.trim()}\n`
		: "";

	const prompt = `You are working on task "${task.title}" (${task.slug}).

${metadata}

## Task Description

${task.description || "No description provided."}
${additionalSection}
## Instructions

You are running fully autonomously. Do not ask questions or wait for user feedback — make all decisions independently based on the codebase and task description.

1. Explore the codebase to understand the relevant code and architecture
2. Create a detailed execution plan for this task including:
   - Purpose and scope of the changes
   - Key assumptions
   - Concrete implementation steps with specific files to modify
   - How to validate the changes work correctly
3. Implement the plan
4. Verify your changes work correctly (run relevant tests, typecheck, lint)
5. When done, use the Superset MCP \`update_task\` tool to update task "${task.id}" with a summary of what was done`;

	const delimiter = `SUPERSET_PROMPT_${crypto.randomUUID().replaceAll("-", "")}`;

	return [
		`claude --dangerously-skip-permissions "$(cat <<'${delimiter}'`,
		prompt,
		delimiter,
		')"',
	].join("\n");
}
