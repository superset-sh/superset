import { isAbsolute } from "node:path";
import { TRPCError } from "@trpc/server";
import type { AccountResumeHistory } from "../../../terminal-agents/saved-conversations/inspect-native-history";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import { inspectSavedConversationTask } from "../../../workers/tasks/harness";
import type { SessionAccount } from "../usage/session-account/session-account";

export type { AccountResumeHistory } from "../../../terminal-agents/saved-conversations/inspect-native-history";

function refuse(): never {
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message:
			"The exact saved conversation is unavailable or ambiguous in the selected account. Shared conversation history is required. Nothing was launched.",
	});
}

export async function inspectAccountResumeHistory(input: {
	source: SessionAccount;
	target: SessionAccount;
	sessionId: string;
	cwd: string;
}): Promise<AccountResumeHistory> {
	const { source, target, sessionId, cwd } = input;
	if (
		!source.directory ||
		!target.directory ||
		!isAbsolute(source.directory) ||
		!isAbsolute(target.directory) ||
		source.agent !== target.agent ||
		!/^[\w-]+$/.test(sessionId)
	)
		refuse();
	try {
		const evidence = await getHostWorkerPool().run(
			inspectSavedConversationTask,
			{
				provider: source.agent,
				sourceDirectory: source.directory,
				targetDirectory: target.directory,
				sessionId,
				cwd,
			},
		);
		if (!evidence) refuse();
		return evidence;
	} catch {
		refuse();
	}
}

export function sameAccountResumeHistory(
	left: AccountResumeHistory,
	right: AccountResumeHistory,
): boolean {
	return (
		left.path === right.path &&
		left.device === right.device &&
		left.inode === right.inode &&
		left.size === right.size &&
		left.modifiedAt === right.modifiedAt &&
		left.changedAt === right.changedAt &&
		left.sha256 === right.sha256
	);
}
