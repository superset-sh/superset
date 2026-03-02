import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function SlackLinkedPage() {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
			<div className="flex flex-col items-center gap-6">
				<div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
					<CheckCircle2 className="size-8 text-emerald-500" />
				</div>
				<div className="flex flex-col items-center gap-2 text-center">
					<h1 className="text-2xl font-semibold">Slack Account Linked</h1>
					<p className="max-w-sm text-muted-foreground">
						Your Slack account has been linked to Superset. You can close this
						tab and return to Slack.
					</p>
				</div>
				<Link
					href="/integrations/slack"
					className="text-sm text-muted-foreground/70 underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground"
				>
					Go to Slack integration settings
				</Link>
			</div>
		</div>
	);
}
