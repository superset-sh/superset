import { Button } from "@superset/ui/button";
import {
	type BoardCard as BoardCardModel,
	useFreeSoloBoardStore,
} from "renderer/stores/free-solo-board";

/** What a card renders instead of its terminal once reconciliation has
 *  positive evidence the thing it points at is gone. Removing the card here
 *  never touches the workspace or session — that's a separate, explicit
 *  action from whatever deleted it. */
export function DeadCardTile({ card }: { card: BoardCardModel }) {
	const removeCard = useFreeSoloBoardStore((state) => state.removeCard);
	const addCard = useFreeSoloBoardStore((state) => state.addCard);

	const isWorkspaceGone = card.missing === "workspace";

	return (
		<div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
			<p className="text-sm text-muted-foreground">
				{isWorkspaceGone
					? "This workspace no longer exists."
					: "This terminal session was closed."}
			</p>
			<div className="flex gap-2">
				<Button
					size="sm"
					variant="secondary"
					onClick={() => removeCard(card.id)}
				>
					Remove
				</Button>
				{!isWorkspaceGone && (
					<Button
						size="sm"
						onClick={() => {
							removeCard(card.id);
							// A fresh card id is unavoidable — it is the runtime
							// registry's instanceId, and the pane store is built
							// from it once — but "here" means this spot at this
							// size, so the geometry comes along.
							addCard({
								workspaceId: card.workspaceId,
								terminalId: crypto.randomUUID(),
								createOnAttach: true,
								at: { x: card.x, y: card.y, w: card.w, h: card.h },
							});
						}}
					>
						Start a new terminal here
					</Button>
				)}
			</div>
		</div>
	);
}
