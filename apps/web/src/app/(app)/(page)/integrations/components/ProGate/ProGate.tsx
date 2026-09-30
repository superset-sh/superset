import { Button } from "@superset/ui/button";
import Link from "next/link";

interface ProGateProps {
	message: string;
	upgradeLabel: string;
}

export function ProGate({ message, upgradeLabel }: ProGateProps) {
	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">{message}</p>
			<Button asChild>
				<Link href="/settings/billing">{upgradeLabel}</Link>
			</Button>
		</div>
	);
}
