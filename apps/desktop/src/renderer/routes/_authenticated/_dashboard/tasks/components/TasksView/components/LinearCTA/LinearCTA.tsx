import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { SiLinear } from "react-icons/si";

export function LinearCTA() {
	const navigate = useNavigate();

	const handleConnectLinear = () => {
		navigate({ to: "/settings/integrations" });
	};

	return (
		<div className="flex-1 flex items-center justify-center p-6">
			<div className="flex flex-col items-center gap-4 max-w-md text-center">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-muted/50">
					<SiLinear className="size-8" />
				</div>
				<div className="space-y-2">
					<h3 className="text-lg font-semibold">
						<Trans id="dashboard.tasks.linearCta.title">Connect Linear</Trans>
					</h3>
					<p className="text-sm text-muted-foreground">
						<Trans id="dashboard.tasks.linearCta.description">
							Connect your Linear workspace to sync issues and manage tasks
							directly from Superset.
						</Trans>
					</p>
				</div>
				<Button onClick={handleConnectLinear}>
					<Trans id="dashboard.tasks.linearCta.connectButton">
						Connect Linear
					</Trans>
				</Button>
			</div>
		</div>
	);
}
