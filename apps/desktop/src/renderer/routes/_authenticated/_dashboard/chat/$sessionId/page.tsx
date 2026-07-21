import { createFileRoute } from "@tanstack/react-router";
import { FreeformSessionProvider } from "../providers/FreeformSessionProvider";
import { FreeformSessionContent } from "./components/FreeformSessionContent";

interface FreeformSessionSearch {
	// "terminal" for a brand-new session (opens a terminal first); otherwise the
	// route is opening an existing chat session.
	start?: "terminal";
}

export const Route = createFileRoute(
	"/_authenticated/_dashboard/chat/$sessionId/",
)({
	component: FreeformSessionPage,
	validateSearch: (search: Record<string, unknown>): FreeformSessionSearch => ({
		start: search.start === "terminal" ? "terminal" : undefined,
	}),
});

function FreeformSessionPage() {
	const { sessionId } = Route.useParams();
	const { start } = Route.useSearch();

	return (
		<div className="flex min-h-0 min-w-0 flex-1">
			<FreeformSessionProvider key={sessionId} sessionId={sessionId}>
				<FreeformSessionContent
					initialChatSessionId={sessionId}
					initialTab={start === "terminal" ? "terminal" : "chat"}
				/>
			</FreeformSessionProvider>
		</div>
	);
}
