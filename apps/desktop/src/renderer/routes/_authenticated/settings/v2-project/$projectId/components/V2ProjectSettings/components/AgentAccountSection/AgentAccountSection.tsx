import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { AGENT_LABELS } from "renderer/routes/_authenticated/settings/utils/agent-labels";
import {
	RestartSessionsDialog,
	type RestartSessionsPrompt,
} from "../../../../../../components/RestartSessionsDialog";
import { useRestartAgentSessions } from "../../../../../../hooks/useRestartAgentSessions";

const HOST_DEFAULT = "host-default";
const UNLISTED_PIN = "unlisted-pin";

interface AgentAccountSectionProps {
	projectId: string;
	hostUrl: string;
	agent: "claude" | "codex";
	accounts: UsageAccount[];
	/** Current pin; `null` follows the host default, `""` is the system login. */
	pinned: string | null;
	onChanged: () => void;
}

export function AgentAccountSection({
	projectId,
	hostUrl,
	agent,
	accounts,
	pinned,
	onChanged,
}: AgentAccountSectionProps) {
	const { t } = useLingui();
	const [restartPrompt, setRestartPrompt] =
		useState<RestartSessionsPrompt | null>(null);
	const { countRestartCandidates, restartMutation } =
		useRestartAgentSessions(hostUrl);

	const label = (account: UsageAccount) => account.email ?? account.sourceLabel;
	const hostDefault = accounts.find((account) => account.isDefault);
	const pinnedAccount = accounts.find(
		(account) => pinned !== null && (account.selection ?? "") === pinned,
	);
	const effectiveSelection = pinned ?? hostDefault?.selection ?? "";

	// Running agents keep the account their terminal started with, so offer
	// to restart this project's agents when the account they use changed.
	const offerRestart = async (next: UsageAccount | undefined) => {
		if (!next || (next.selection ?? "") === effectiveSelection) return;
		const count = await countRestartCandidates(agent, projectId).catch(() => 0);
		if (count === 0) return;
		setRestartPrompt({
			agent,
			providerLabel: AGENT_LABELS[agent],
			accountLabel: label(next),
			count,
		});
	};

	const setMutation = useMutation({
		mutationFn: (account: { selection: string | null } | null) =>
			getHostServiceClientByUrl(hostUrl).usage.setProjectAccount.mutate({
				projectId,
				agent,
				account,
			}),
		onSuccess: (result, account) => {
			onChanged();
			if (!result.pinsPublished) {
				toast.warning(
					t({
						message:
							"Saved, but open terminals keep their current account until reopened.",
					}),
				);
			}
			void offerRestart(
				account
					? accounts.find(
							(item) => (item.selection ?? "") === (account.selection ?? ""),
						)
					: hostDefault,
			);
		},
		onError: (err) =>
			toast.error(
				errorMessage(err, t({ message: "Failed to update agent account" })),
			),
	});

	const confirmRestart = () => {
		if (!restartPrompt) return;
		const { accountLabel } = restartPrompt;
		setRestartPrompt(null);
		restartMutation.mutate(
			{ agent, projectId },
			{
				onSuccess: () =>
					toast.success(
						t({ message: `Restarting agents on ${accountLabel}.` }),
						{
							description: t({
								message: "Each session resumes where it left off.",
							}),
						},
					),
				onError: (error) => toast.error(errorMessage(error)),
			},
		);
	};

	return (
		<>
			<Select
				value={
					pinnedAccount?.accountKey ??
					(pinned === null ? HOST_DEFAULT : UNLISTED_PIN)
				}
				disabled={setMutation.isPending}
				onValueChange={(value) => {
					if (value === UNLISTED_PIN) return;
					const account = accounts.find((item) => item.accountKey === value);
					setMutation.mutate(account ? { selection: account.selection } : null);
				}}
			>
				<SelectTrigger id={`project-${agent}-account`} className="w-[240px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={HOST_DEFAULT}>
						{hostDefault
							? t({ message: `Default (${label(hostDefault)})` })
							: t({ message: "Default" })}
					</SelectItem>
					{pinned !== null && !pinnedAccount && (
						<SelectItem value={UNLISTED_PIN}>
							{pinned
								? t({ message: `Account not found: ${pinned}` })
								: t({ message: "System login" })}
						</SelectItem>
					)}
					{accounts.map((account) => (
						<SelectItem key={account.accountKey} value={account.accountKey}>
							{label(account)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<RestartSessionsDialog
				prompt={restartPrompt}
				onDecline={() => setRestartPrompt(null)}
				onConfirm={confirmRestart}
			/>
		</>
	);
}
