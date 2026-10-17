import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useState } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { CreateAccountTerminal } from "../../hooks/useAgentSessionLauncher";
import { AccountTerminalDialogFrame } from "./components/AccountTerminalDialogFrame";
import { AccountTerminalForm } from "./components/AccountTerminalForm";

export function AccountTerminalDialog({
	onClose,
	onLaunch,
	returnFocus,
}: {
	onClose: () => void;
	onLaunch: CreateAccountTerminal;
	returnFocus: HTMLElement | null;
}) {
	const { t } = useLingui();
	const { hostUrl } = useWorkspaceClient();
	const configs = useV2AgentConfigs(hostUrl);
	const [configId, setConfigId] = useState("");
	const [launching, setLaunching] = useState(false);
	const choices = (configs.data ?? []).filter(
		(config) => config.presetId === "claude" || config.presetId === "codex",
	);
	const selectedConfigId = configId || choices[0]?.id || "";
	const selectedConfigExists = choices.some(
		(config) => config.id === selectedConfigId,
	);
	const accounts = useQuery({
		queryKey: ["agent-launch-accounts", hostUrl, selectedConfigId],
		enabled: Boolean(hostUrl && selectedConfigExists),
		queryFn: () => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(hostUrl).agents.launchAccounts.query({
				agent: selectedConfigId,
			});
		},
		retry: false,
		staleTime: 0,
	});
	const unsupportedHost =
		accounts.error instanceof TRPCClientError &&
		accounts.error.data?.code === "NOT_FOUND" &&
		accounts.error.message.includes("agents.launchAccounts");
	const error = !hostUrl
		? t({ message: "Host service is not running" })
		: unsupportedHost
			? t({
					message: "Update this host to choose an account for a new terminal.",
				})
			: configs.isError || accounts.isError
				? errorMessage(
						configs.error ?? accounts.error,
						t({ message: "Could not load accounts" }),
					)
				: !configs.isPending && !selectedConfigExists
					? t({ message: "No agent is configured on this host" })
					: accounts.data?.supported === false
						? t({
								message:
									"This agent configuration does not support account selection.",
							})
						: null;
	return (
		<AccountTerminalDialogFrame
			launching={launching}
			onClose={onClose}
			returnFocus={returnFocus}
		>
			<AccountTerminalForm
				key={`${hostUrl}:${selectedConfigId}`}
				configs={choices}
				configId={selectedConfigId}
				onConfigChange={setConfigId}
				accounts={accounts.data?.supported ? accounts.data.accounts : []}
				loading={
					configs.isPending || (selectedConfigExists && accounts.isPending)
				}
				refreshing={accounts.isFetching}
				error={error}
				launching={launching}
				onRefresh={async () => {
					await accounts.refetch();
				}}
				onCancel={onClose}
				onLaunch={async (account) => {
					setLaunching(true);
					try {
						await onLaunch({ configId: selectedConfigId, account });
						onClose();
					} finally {
						setLaunching(false);
					}
				}}
			/>
		</AccountTerminalDialogFrame>
	);
}
