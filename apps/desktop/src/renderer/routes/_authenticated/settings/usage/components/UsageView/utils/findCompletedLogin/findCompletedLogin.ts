import type { UsageLogins } from "../../../../hooks/useHostUsageLogins";
import type { AccountCredentialKind } from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";

export interface FoundLogin {
	selection: string | null;
	label: string;
	credentialKind: AccountCredentialKind;
}

export function findCompletedLogin({
	agent,
	credentialKind,
	selection,
	baseline,
	current,
	commandSucceeded,
}: {
	agent: ManagedAgent;
	credentialKind: AccountCredentialKind;
	selection: string | null;
	baseline: UsageLogins;
	current: UsageLogins;
	commandSucceeded: boolean;
}): FoundLogin | null {
	const read = (logins: UsageLogins) => {
		if (agent === "claude") {
			if (selection === null)
				return {
					fingerprint: logins.claudeDefaultFingerprint,
					label: logins.claudeDefaultEmail ?? "Claude Code",
					credentialKind: "subscription",
				};
			const entry = logins.claude.find(
				(login) => login.configDir === selection,
			);
			return entry && { ...entry, label: entry.email ?? entry.configDir };
		}
		const entry =
			selection === null
				? logins.codex[0]
				: logins.codex.find((login) => login.home === selection);
		return entry && { ...entry, label: entry.home };
	};
	const before = read(baseline);
	const after = read(current);
	if (!after?.fingerprint || after.credentialKind !== credentialKind)
		return null;
	if (!commandSucceeded && after.fingerprint === before?.fingerprint)
		return null;
	return { selection, label: after.label, credentialKind };
}
