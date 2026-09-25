import { Trans } from "@lingui/react/macro";
import { HiCheck, HiOutlineClock } from "react-icons/hi2";

// Sample rows, deliberately untranslated like the other demos' fixtures.
const AUTOMATIONS = [
	{
		id: "1",
		name: "Morning standup digest",
		cadence: "Weekdays 9:00",
		ran: true,
	},
	{
		id: "2",
		name: "Nightly dependency sweep",
		cadence: "Daily 3:00",
		ran: true,
	},
	{
		id: "3",
		name: "Weekly changelog draft",
		cadence: "Fridays 17:00",
		ran: false,
	},
	{ id: "4", name: "Triage new Sentry issues", cadence: "Hourly", ran: false },
];

export function AutomationsDemo() {
	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-2xl overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 bg-muted/80 border-b border-border/50">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-muted-foreground ml-1">
							<Trans>Automations</Trans>
						</span>
					</div>
					<span className="text-xs text-muted-foreground/70 bg-foreground/10 px-2 py-0.5 rounded">
						<Trans>Up next</Trans>
					</span>
				</div>

				<div className="p-2">
					{AUTOMATIONS.map((automation) => (
						<div
							key={automation.id}
							className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-foreground/5 transition-colors cursor-pointer group"
						>
							{automation.ran ? (
								<div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
									<HiCheck className="w-3 h-3 text-emerald-400" />
								</div>
							) : (
								<div className="w-5 h-5 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
									<HiOutlineClock className="w-3 h-3 text-amber-400" />
								</div>
							)}
							<div className="flex-1 min-w-0">
								<span className="text-xs block truncate text-foreground">
									{automation.name}
								</span>
							</div>
							<span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
								{automation.cadence}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
