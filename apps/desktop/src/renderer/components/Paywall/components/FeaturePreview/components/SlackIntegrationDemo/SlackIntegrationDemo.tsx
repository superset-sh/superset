import { FaSlack } from "react-icons/fa";
import { HiCheck } from "react-icons/hi2";

const MESSAGES = [
	{
		id: "1",
		author: "Maya",
		text: "Can someone turn the login bug into a task?",
	},
	{
		id: "2",
		author: "Superset",
		text: "Created LIN-248 and linked the thread.",
	},
];

export function SlackIntegrationDemo() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<div className="w-[300px] overflow-hidden rounded-lg border border-border bg-card/90 shadow-2xl backdrop-blur-sm">
				<div className="flex items-center justify-between border-border/50 border-b bg-muted/80 px-4 py-3">
					<div className="flex items-center gap-2">
						<FaSlack className="size-4 text-violet-400" />
						<span className="font-medium text-foreground text-xs">
							#engineering
						</span>
					</div>
					<span className="rounded bg-foreground/10 px-2 py-0.5 text-muted-foreground/70 text-xs">
						Live
					</span>
				</div>

				<div className="space-y-3 p-4">
					{MESSAGES.map((message) => (
						<div key={message.id} className="flex gap-3">
							<div className="flex size-7 shrink-0 items-center justify-center rounded bg-foreground/10 font-semibold text-[10px] text-foreground/90">
								{message.author === "Superset" ? "S" : "M"}
							</div>
							<div className="min-w-0 flex-1">
								<div className="font-medium text-foreground text-xs">
									{message.author}
								</div>
								<div className="text-muted-foreground text-xs leading-relaxed">
									{message.text}
								</div>
							</div>
						</div>
					))}

					<div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
						<div className="flex items-center gap-2 text-emerald-300 text-xs">
							<HiCheck className="size-3.5" />
							<span className="font-medium">Task synced to Linear</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
