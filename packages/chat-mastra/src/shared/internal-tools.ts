export const INTERNAL_MASTRA_TOOL_NAMES = ["request_sandbox_access"] as const;

export function createDeniedToolPolicies(
	toolNames: readonly string[],
): Record<string, "deny"> {
	return Object.fromEntries(
		toolNames.map((toolName) => [toolName, "deny" as const]),
	);
}
