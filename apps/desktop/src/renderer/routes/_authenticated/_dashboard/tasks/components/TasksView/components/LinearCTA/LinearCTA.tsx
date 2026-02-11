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
					<h3 className="text-lg font-semibold">Connect Linear</h3>
					<p className="text-sm text-muted-foreground">
						Connect your Linear workspace to sync issues and manage tasks
						directly from Superset.
					</p>
				</div>
				<Button onClick={handleConnectLinear}>Connect Linear</Button>
			</div>
		</div>
	);
}
