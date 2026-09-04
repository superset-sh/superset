import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { Section } from "../../../AgentFormControls";
import { isConfigured, useCloudAuthMock } from "./cloud-auth-mock-store";
import { CloudAuthDialog } from "./components/CloudAuthDialog";

interface CloudAuthSectionProps {
	presetId: string;
	label: string;
}

export function CloudAuthSection({ presetId, label }: CloudAuthSectionProps) {
	const { t } = useLingui();
	const [state, update] = useCloudAuthMock(presetId);
	const [open, setOpen] = useState(false);
	const configured = isConfigured(state);

	const statusLabel =
		state.method === "subscription" && state.subscriptionConnected
			? t({ message: "Connected via subscription" })
			: state.method === "api_key" && state.apiKeySaved
				? t({ message: "Connected with API key" })
				: state.method === "custom" && state.customSaved
					? t({ message: "Custom provider" })
					: t({ message: "Not set up" });

	return (
		<Section title={t({ message: "Cloud" })}>
			<div className="flex items-center justify-between gap-8">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">
						<Trans>Sign-in for cloud workspaces</Trans>
					</div>
					<p className="text-sm text-muted-foreground mt-0.5">
						<Trans>
							How {label} signs in when it runs inside a cloud workspace. On
							this machine it uses the login already on it.
						</Trans>
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge variant={configured ? "default" : "secondary"}>
						{statusLabel}
					</Badge>
					<Button
						size="sm"
						variant={configured ? "outline" : "default"}
						onClick={() => setOpen(true)}
					>
						{configured ? <Trans>Manage</Trans> : <Trans>Set up</Trans>}
					</Button>
				</div>
			</div>
			<CloudAuthDialog
				label={label}
				onOpenChange={setOpen}
				open={open}
				presetId={presetId}
				state={state}
				update={update}
			/>
		</Section>
	);
}
