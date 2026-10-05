import { isCloudWorkspaceIgnoredEnvName } from "@superset/shared/agent-credentials";
import { reservedKeyReason } from "@superset/shared/environment-secrets";

export interface EnvFilePlan {
	set: Array<{ key: string; value: string }>;
	skipped: Array<{ key: string; reason: string }>;
}

/**
 * What a laptop .env can give an environment. Names the sandbox owns and
 * agent keys are skipped with the reason, so one of them cannot stop the
 * rest halfway; a repeated name keeps its last value, as a shell would.
 */
export function planEnvFile(
	entries: ReadonlyArray<{ key: string; value: string }>,
): EnvFilePlan {
	const last = new Map<string, string>();
	for (const entry of entries) {
		last.delete(entry.key);
		last.set(entry.key, entry.value);
	}
	const plan: EnvFilePlan = { set: [], skipped: [] };
	for (const [key, value] of last) {
		const reserved = reservedKeyReason(key);
		if (reserved) {
			plan.skipped.push({ key, reason: reserved });
		} else if (isCloudWorkspaceIgnoredEnvName(key)) {
			plan.skipped.push({
				key,
				reason: "agents sign in with: superset connections agents set <agent>",
			});
		} else {
			plan.set.push({ key, value });
		}
	}
	return plan;
}
