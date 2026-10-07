import type { DeviceClient } from "@expo/hub-client";
import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { ToolsSection } from "../ToolsSection";

interface EventLogSectionProps {
	client: DeviceClient;
}

export function EventLogSection({ client }: EventLogSectionProps) {
	const { events, attachEvents, detachEvents } = client;

	return (
		<ToolsSection
			title={<Trans>Event log</Trans>}
			summary={events.length}
			onOpenChange={(open) => (open ? attachEvents() : detachEvents())}
		>
			{events.length === 0 ? (
				<div className="py-2 text-center text-xs text-muted-foreground">
					<Trans>No events yet</Trans>
				</div>
			) : (
				<div className="-mx-1.5 flex max-h-72 flex-col overflow-y-auto">
					{[...events].reverse().map((event) => (
						<div
							key={event.id}
							className="flex items-baseline gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-accent/50"
						>
							<span className="min-w-0 flex-1">
								<span className="block truncate">{event.message}</span>
								<span className="block truncate font-mono text-[10px] text-muted-foreground">
									{[event.source, event.kind, event.action]
										.filter(Boolean)
										.join(" / ")}
								</span>
							</span>
							<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
								{formatDate(new Date(event.timestamp), { timeStyle: "medium" })}
							</span>
						</div>
					))}
				</div>
			)}
		</ToolsSection>
	);
}
