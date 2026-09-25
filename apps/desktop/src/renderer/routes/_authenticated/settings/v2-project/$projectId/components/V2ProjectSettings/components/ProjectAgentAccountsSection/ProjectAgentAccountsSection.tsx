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
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	type UsageAccount,
	useHostUsageQuota,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { SettingsRow } from "../../../../../../components/SettingsRow";

type SwitchableAgent = "claude" | "codex";

/** Select value for "no override — inherit the host default". */
const INHERIT_VALUE = "__inherit__";
/** Select value for the system-default login, whose selection is null. */
const SYSTEM_DEFAULT_VALUE = "__system__";

interface ProjectAgentAccountsSectionProps {
	projectId: string;
	hostUrl: string;
}

function accountLabel(account: UsageAccount): string {
	return account.email ?? account.sourceLabel;
}

export function ProjectAgentAccountsSection({
	projectId,
	hostUrl,
}: ProjectAgentAccountsSectionProps) {
	const { t } = useLingui();
	const { data: accounts } = useHostUsageQuota(hostUrl);
	const overridesQuery = useQuery({
		queryKey: ["host-project-default-accounts", hostUrl, projectId],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).usage.projectDefaultAccounts.query({
				projectId,
			}),
	});
	const setMutation = useMutation({
		mutationFn: (vars: {
			agent: SwitchableAgent;
			override: { selection: string | null } | null;
		}) =>
			getHostServiceClientByUrl(hostUrl).usage.setProjectDefaultAccount.mutate({
				projectId,
				...vars,
			}),
		onSuccess: () => overridesQuery.refetch(),
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to update the project's agent account",
					}),
				),
			),
	});

	const rows: Array<{ agent: SwitchableAgent; label: string }> = [
		{ agent: "claude", label: "Claude Code" },
		{ agent: "codex", label: "Codex" },
	];

	return (
		<>
			{rows.map(({ agent, label }) => {
				const agentAccounts = (accounts ?? []).filter(
					(account) => account.agent === agent,
				);
				const hostDefault = agentAccounts.find((account) => account.isDefault);
				const override = overridesQuery.data?.[agent];
				const value =
					override === undefined || override === null
						? INHERIT_VALUE
						: (override.selection ?? SYSTEM_DEFAULT_VALUE);
				return (
					<SettingsRow
						key={agent}
						label={label}
						hint={
							hostDefault
								? t({
										message: `Host default: ${accountLabel(hostDefault)}`,
									})
								: undefined
						}
					>
						<Select
							value={value}
							disabled={
								overridesQuery.data === undefined || setMutation.isPending
							}
							onValueChange={(next) =>
								setMutation.mutate({
									agent,
									override:
										next === INHERIT_VALUE
											? null
											: {
													selection:
														next === SYSTEM_DEFAULT_VALUE ? null : next,
												},
								})
							}
						>
							<SelectTrigger className="w-[260px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={INHERIT_VALUE}>
									{t({ message: "Use host default" })}
								</SelectItem>
								{agentAccounts.map((account) => (
									<SelectItem
										key={account.accountKey}
										value={account.selection ?? SYSTEM_DEFAULT_VALUE}
									>
										{accountLabel(account)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SettingsRow>
				);
			})}
		</>
	);
}
