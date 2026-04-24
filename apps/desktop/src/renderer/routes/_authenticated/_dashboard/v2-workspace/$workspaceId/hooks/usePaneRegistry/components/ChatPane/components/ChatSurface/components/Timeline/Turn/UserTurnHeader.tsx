/**
 * Minimal user-message header — composes the user message and its parts
 * (text/image/file attachments). Replaced with the polished
 * UserTurnHeader (OpenCode port) in Phase 3.
 */

import type { Part, UserMessage } from "@superset/chat/shared";
import { renderPart } from "../Parts";

export function UserTurnHeader({
	user,
	parts,
}: {
	user: UserMessage;
	parts: Part[];
}) {
	return (
		<div data-message-id={user.id} className="my-4 flex justify-end">
			<div className="bg-muted max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2">
				{parts.map((p) => (
					<div key={p.id}>{renderPart(p, user, false)}</div>
				))}
			</div>
		</div>
	);
}
