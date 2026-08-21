import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { PlainIcon } from "renderer/components/icons/PlainIcon";

export function PlainCTA() {
	const navigate = useNavigate();

	const handleConnectPlain = () => {
		navigate({ to: "/settings/integrations" });
	};

	return (
		<div className="flex-1 flex items-center justify-center p-6">
			<div className="flex flex-col items-center gap-4 max-w-md text-center">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-muted/50">
					<PlainIcon className="size-8" />
				</div>
				<div className="space-y-2">
					<h3 className="text-lg font-semibold">Connect Plain</h3>
					<p className="text-sm text-muted-foreground">
						Connect your Plain workspace to sync support threads and turn
						customer-reported work into tasks in Superset.
					</p>
				</div>
				<Button onClick={handleConnectPlain}>Connect Plain</Button>
			</div>
		</div>
	);
}
