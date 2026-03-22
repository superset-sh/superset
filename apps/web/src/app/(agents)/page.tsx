import { AgentPromptInput } from "./components/AgentPromptInput";
import { AgentsHeader } from "./components/AgentsHeader";
import { SessionList } from "./components/SessionList";

export default function AgentsPage() {
	return (
		<>
			<AgentsHeader />
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
				<AgentPromptInput />
				<SessionList />
			</div>
		</>
	);
}
