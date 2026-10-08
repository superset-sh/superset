import type { UserContent } from "@superset/chat/protocol";
import { ComposerDropZone } from "@superset/chat-ui/ComposerDropZone";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Composer } from "../../../../../ChatSession/components/Composer";
import { ConnectionNotice } from "../../../../../ChatSession/components/ConnectionNotice";
import { heldPromptQueue } from "../../../../../ChatSession/utils/heldPromptQueue";

const NO_COMMANDS: never[] = [];

export function DraftChat({
	draftKey,
	isActive,
	notice,
	onQueue,
	queued,
	workspaceId,
}: {
	draftKey: string;
	isActive: boolean;
	notice: ReactNode;
	onQueue: (content: UserContent[]) => void;
	queued: UserContent[][];
	workspaceId: string;
}) {
	const promptQueue = useMemo(() => heldPromptQueue(queued), [queued]);

	return (
		<ComposerDropZone className="flex h-full min-h-0 w-full min-w-0 flex-col">
			<div className="min-h-0 flex-1" />
			<ConnectionNotice>{notice}</ConnectionNotice>
			<Composer
				availableCommands={NO_COMMANDS}
				draftKey={draftKey}
				isActive={isActive}
				onSend={(content) => onQueue(content)}
				promptQueue={promptQueue}
				workspaceId={workspaceId}
			/>
		</ComposerDropZone>
	);
}
