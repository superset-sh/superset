import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiLinear } from "react-icons/si";

const DISMISSED_KEY = "tasks.linearCtaDismissed";

export function LinearCTA() {
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState(() => {
		try {
			return localStorage.getItem(DISMISSED_KEY) === "1";
		} catch {
			return false;
		}
	});

	if (dismissed) return null;

	const handleConnectLinear = () => {
		navigate({ to: "/settings/integrations" });
	};

	const handleDismiss = () => {
		try {
			localStorage.setItem(DISMISSED_KEY, "1");
		} catch {}
		setDismissed(true);
	};

	return (
		<div className="flex items-center gap-3 border-b px-4 py-2">
			<SiLinear className="size-4 shrink-0" />
			<p className="flex-1 text-sm text-muted-foreground">
				<Trans>
					Connect your Linear workspace to sync issues and manage tasks directly
					from Superset.
				</Trans>
			</p>
			<Button size="sm" variant="outline" onClick={handleConnectLinear}>
				<Trans>Connect Linear</Trans>
			</Button>
			<Button
				size="sm"
				variant="ghost"
				aria-label="Dismiss"
				onClick={handleDismiss}
			>
				×
			</Button>
		</div>
	);
}
