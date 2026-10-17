import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useWorkspaceClient } from "@superset/workspace-client";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useState } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { AccountTerminalForm } from "../AccountTerminalDialog/components/AccountTerminalForm";
import { SavedConversationsBrowser } from "./components/SavedConversationsBrowser";

export function SavedConversationsDialog({
	workspaceId,
	onClose,
	onOpenTerminal,
}: {
	workspaceId: string;
	onClose: () => void;
	onOpenTerminal: (terminalId: string) => void;
}) {
	const { t } = useLingui();
	const { hostUrl } = useWorkspaceClient();
	const configs = useV2AgentConfigs(hostUrl);
	const choices = (configs.data ?? []).filter(
		(config) => config.presetId === "claude",
	);
	const [configId, setConfigId] = useState("");
	const selectedConfigId = configId || choices[0]?.id || "";
	const configExists = choices.some((config) => config.id === selectedConfigId);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const scope = JSON.stringify([hostUrl, workspaceId, selectedConfigId]);
	const [selected, setSelected] = useState<{
		scope: string;
		account: { selection: string | null; identity: string };
		label: string;
	} | null>(null);
	const browserKey =
		selected?.scope === scope
			? JSON.stringify([scope, selected.account])
			: null;
	const busy = Boolean(browserKey && busyKey === browserKey);
	const accounts = useQuery({
		queryKey: ["agent-launch-accounts", hostUrl, selectedConfigId],
		enabled: Boolean(hostUrl && configExists),
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).agents.launchAccounts.query({
				agent: selectedConfigId,
			}),
		retry: false,
		staleTime: 0,
	});
	const unsupported =
		accounts.error instanceof TRPCClientError &&
		accounts.error.data?.code === "NOT_FOUND" &&
		accounts.error.message.includes("agents.launchAccounts");
	const error = !hostUrl
		? t({ message: "Host service is not running" })
		: unsupported
			? t({ message: "Update this host to open saved Claude history." })
			: accounts.isError || configs.isError
				? errorMessage(
						accounts.error ?? configs.error,
						t({ message: "Could not load accounts" }),
					)
				: !configs.isPending && !configExists
					? t({ message: "No Claude agent is configured on this host." })
					: accounts.data?.supported === false
						? t({
								message:
									"This agent configuration does not support account selection.",
							})
						: null;
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
				<DialogHeader>
					<DialogTitle>
						<Trans>Open saved Claude conversation</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Open history from this account in the current workspace. After
							adoption, later opens use its current local history. Background
							work is not transferred.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{selected?.scope === scope ? (
					<SavedConversationsBrowser
						key={browserKey}
						hostUrl={hostUrl}
						workspaceId={workspaceId}
						agent={selectedConfigId}
						account={selected.account}
						accountLabel={selected.label}
						onBack={() => setSelected(null)}
						onBusy={(value) =>
							setBusyKey((current) =>
								value ? browserKey : current === browserKey ? null : current,
							)
						}
						onOpened={(terminalId) => {
							onOpenTerminal(terminalId);
							onClose();
						}}
					/>
				) : (
					<AccountTerminalForm
						key={scope}
						mode="browse"
						configs={choices}
						configId={selectedConfigId}
						onConfigChange={(id) => {
							setSelected(null);
							setConfigId(id);
						}}
						accounts={accounts.data?.supported ? accounts.data.accounts : []}
						loading={configs.isPending || (configExists && accounts.isPending)}
						refreshing={accounts.isFetching}
						error={error}
						launching={false}
						onRefresh={async () => {
							await accounts.refetch();
						}}
						onCancel={onClose}
						onLaunch={async (account) => {
							const selectedAccount = accounts.data?.accounts.find(
								(item) =>
									item.selection === account.selection &&
									item.identity === account.identity,
							);
							if (!selectedAccount)
								throw new Error(
									t({
										message:
											"The selected login changed. Choose an account again.",
									}),
								);
							setSelected({ scope, account, label: selectedAccount.email });
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
