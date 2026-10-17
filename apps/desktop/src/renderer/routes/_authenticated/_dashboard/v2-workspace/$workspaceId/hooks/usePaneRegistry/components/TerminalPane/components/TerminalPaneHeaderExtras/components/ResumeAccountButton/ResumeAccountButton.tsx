import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { getTerminalResumedSuccessorQueryKey } from "renderer/hooks/host-service/useTerminalResumedSuccessor/useTerminalResumedSuccessor";
import { useWorkspaceEvent } from "renderer/hooks/host-service/useWorkspaceEvent";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { AccountTerminalForm } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/AccountTerminalDialog/components/AccountTerminalForm";

import { resumeWithSuccessorRecovery } from "./resumeWithSuccessorRecovery";

export function ResumeAccountButton({
	workspaceId,
	terminalId,
}: {
	workspaceId: string;
	terminalId: string;
}) {
	const { t } = useLingui();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [resuming, setResuming] = useState(false);
	const sourceKey = ["account-resume-source", hostUrl, workspaceId, terminalId];
	const source = useQuery({
		queryKey: sourceKey,
		enabled: Boolean(hostUrl && !binding),
		queryFn: ({ signal }) => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).terminalAgents.accountResumeSource.query(
				{ workspaceId, terminalId },
				{ signal },
			);
		},
		retry: false,
		staleTime: 15_000,
	});
	const invalidateSource = (event: { terminalId: string }) => {
		if (event.terminalId === terminalId) {
			void queryClient.invalidateQueries({ queryKey: sourceKey });
		}
	};
	useWorkspaceEvent("agent:lifecycle", workspaceId, invalidateSource);
	useWorkspaceEvent("terminal:lifecycle", workspaceId, invalidateSource);
	const candidate = source.data;
	const accounts = useQuery({
		queryKey: ["agent-launch-accounts", hostUrl, candidate?.agent],
		enabled: Boolean(open && hostUrl && candidate?.ready && !binding),
		queryFn: ({ signal }) => {
			if (!hostUrl || !candidate) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(hostUrl).agents.launchAccounts.query(
				{ agent: candidate.agent },
				{ signal },
			);
		},
		retry: false,
		staleTime: 0,
	});
	// Older hosts do not expose this capability. Never fall back to a default-account resume.
	if (!candidate && !open) return null;
	if (binding && !open) return null;
	const error =
		binding || !candidate || source.isError
			? t({ message: "This conversation is no longer available to resume." })
			: !candidate.ready
				? (candidate.reason ??
					t({
						message:
							"This conversation cannot be resumed with another account.",
					}))
				: accounts.isError
					? errorMessage(
							accounts.error,
							t({ message: "Could not load accounts" }),
						)
					: accounts.data?.supported === false
						? t({
								message:
									"This agent configuration does not support account selection.",
							})
						: null;
	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={t({ message: "Resume with another account" })}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
						onClick={() => {
							setOpen(true);
							void source.refetch();
						}}
					>
						<UsersRound className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<Trans>Resume with another account</Trans>
				</TooltipContent>
			</Tooltip>
			<Dialog open={open} onOpenChange={(value) => !resuming && setOpen(value)}>
				<DialogContent className="sm:max-w-md" showCloseButton={!resuming}>
					<DialogHeader>
						<DialogTitle>
							<Trans>Resume with another account</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Reopen the saved conversation in the same workspace. No message
								is sent. Background work is not transferred.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					{candidate && (
						<p className="break-all font-mono text-xs text-muted-foreground">
							{candidate.sessionId}
						</p>
					)}
					<AccountTerminalForm
						key={`${hostUrl}:${terminalId}:${candidate?.revision}`}
						mode="resume"
						configs={
							candidate
								? [
										{
											id: candidate.agent,
											label:
												candidate.provider === "claude" ? "Claude" : "Codex",
										},
									]
								: []
						}
						configId={candidate?.agent ?? ""}
						onConfigChange={() => {}}
						accounts={accounts.data?.supported ? accounts.data.accounts : []}
						loading={
							source.isPending ||
							(Boolean(candidate?.ready) && accounts.isPending)
						}
						refreshing={source.isFetching || accounts.isFetching}
						error={error}
						launching={resuming}
						onCancel={() => setOpen(false)}
						onRefresh={async () => {
							await source.refetch();
							await accounts.refetch();
						}}
						onLaunch={async (account) => {
							if (!candidate?.ready || !hostUrl || binding) return;
							setResuming(true);
							try {
								const client = getHostServiceClientByUrl(hostUrl);
								await resumeWithSuccessorRecovery(
									queryClient,
									getTerminalResumedSuccessorQueryKey(workspaceId, terminalId),
									async () => {
										const result =
											await client.terminalAgents.resumeWithAccount.mutate({
												workspaceId,
												terminalId,
												expectedRevision: candidate.revision,
												account,
											});
										if (!result.resumed)
											throw new Error(
												t({
													message:
														"This conversation is no longer available to resume.",
												}),
											);
										return {
											terminalId: result.terminalId,
											label: result.label,
										};
									},
									() =>
										client.terminalAgents.resumedSuccessor.query({
											workspaceId,
											terminalId,
										}),
								);
								setOpen(false);
							} finally {
								setResuming(false);
								void source.refetch();
							}
						}}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
