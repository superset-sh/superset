import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChatPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/chat/$sessionId/",
)({
	component: FreeformChatPage,
});

function FreeformChatPage() {
	const { sessionId } = Route.useParams();
	const navigate = useNavigate();

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			{/* No workspaceId — this is a freeform chat; the host runs it in ~. */}
			<ChatPane
				key={sessionId}
				sessionId={sessionId}
				onSessionIdChange={(nextSessionId) => {
					navigate({
						to: "/chat/$sessionId",
						params: { sessionId: nextSessionId ?? crypto.randomUUID() },
					});
				}}
			/>
		</div>
	);
}
