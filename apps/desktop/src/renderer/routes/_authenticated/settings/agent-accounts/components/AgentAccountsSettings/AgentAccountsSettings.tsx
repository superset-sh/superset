import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { AgentIcon } from "renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/components/AgentIcon";
import {
	isConfigured,
	useAgentCredential,
} from "../../hooks/useAgentCredential";
import { CloudAuthDialog } from "./components/CloudAuthDialog";

/** Agents the sandbox image carries; a row per agent, like a provider list. */
const CLOUD_AGENTS: Array<{ presetId: string; label: string }> = [
	{ presetId: "claude", label: "Claude Code" },
	{ presetId: "codex", label: "Codex" },
];

export function AgentAccountsSettings() {
	return (
		<div className="w-full max-w-4xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Agents</Trans>
				</h2>
				<p className="mt-1 text-sm text-muted-foreground max-w-prose">
					<Trans>
						How your agents sign in inside cloud workspaces. Other people
						connect their own subscriptions or API keys; on this machine each
						agent keeps using the login already on it.
					</Trans>
				</p>
			</div>
			<div className="divide-y divide-border">
				{CLOUD_AGENTS.map((agent) => (
					<AgentAccountRow key={agent.presetId} {...agent} />
				))}
			</div>
		</div>
	);
}

function AgentAccountRow({
	presetId,
	label,
}: {
	presetId: string;
	label: string;
}) {
	const { t } = useLingui();
	const credential = useAgentCredential(presetId);
	const [open, setOpen] = useState(false);
	const { state } = credential;
	const configured = isConfigured(state);
	const statusLabel =
		state.method === "subscription" && state.subscriptionConnected
			? t({ message: "Connected via subscription" })
			: state.method === "api_key" && state.apiKeySaved
				? t({ message: "Connected with API key" })
				: t({ message: "Custom provider" });

	return (
		<div className="flex items-center gap-4 py-4">
			<div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
				<AgentIcon className="size-4" iconId={null} presetId={presetId} />
			</div>
			<div className="min-w-0 flex-1 text-sm font-medium">{label}</div>
			{configured ? (
				<Button
					className="gap-2"
					onClick={() => setOpen(true)}
					size="sm"
					variant="outline"
				>
					<Badge variant="secondary">{statusLabel}</Badge>
					<Check className="size-4 text-emerald-500" />
				</Button>
			) : (
				<Button
					className="gap-1.5"
					onClick={() => setOpen(true)}
					size="sm"
					variant="outline"
				>
					<Trans>Set up</Trans>
					<Plus className="size-4" />
				</Button>
			)}
			<CloudAuthDialog
				accountLabel={credential.accountLabel}
				chooseMethod={credential.chooseMethod}
				disconnect={credential.disconnect}
				label={label}
				onOpenChange={setOpen}
				open={open}
				presetId={presetId}
				save={credential.save}
				state={state}
			/>
		</div>
	);
}
