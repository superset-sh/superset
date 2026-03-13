import { DailyBriefingSection } from "./components/DailyBriefingSection";
import { IssueQueueSection } from "./components/IssueQueueSection";
import { TeamActivitySection } from "./components/TeamActivitySection";

export function PulseView() {
	return (
		<div className="flex-1 min-h-0 overflow-y-auto">
			<DailyBriefingSection />
			<IssueQueueSection />
			<TeamActivitySection />
		</div>
	);
}
