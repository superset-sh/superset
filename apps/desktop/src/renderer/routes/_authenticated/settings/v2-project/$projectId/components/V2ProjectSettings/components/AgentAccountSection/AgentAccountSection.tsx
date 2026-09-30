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
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const HOST_DEFAULT = "host-default";

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
	const setMutation = useMutation({
		mutationFn: (account: { selection: string | null } | null) =>
			getHostServiceClientByUrl(hostUrl).usage.setProjectAccount.mutate({
				projectId,
				agent,
				account,
			}),
		onSuccess: () => onChanged(),
		onError: (err) =>
			toast.error(
				errorMessage(err, t({ message: "Failed to update agent account" })),
			),
	});

	const label = (account: UsageAccount) => account.email ?? account.sourceLabel;
	const hostDefault = accounts.find((account) => account.isDefault);
	const pinnedAccount = accounts.find(
		(account) => pinned !== null && (account.selection ?? "") === pinned,
	);

	return (
		<Select
			value={pinnedAccount?.accountKey ?? HOST_DEFAULT}
			disabled={setMutation.isPending}
			onValueChange={(value) => {
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
				{accounts.map((account) => (
					<SelectItem key={account.accountKey} value={account.accountKey}>
						{label(account)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
