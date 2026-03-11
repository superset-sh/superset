import { normalizeWorkspaceFilePath } from "../../../../../../../../ChatPane/ChatInterface/utils/file-paths";
import type { MastraMessage, MastraMessagePart } from "../../types";
import { parseUserMentions } from "../../utils/parseUserMentions";

interface UserMessageTextProps {
	message: MastraMessage;
	workspaceCwd?: string;
	onOpenMentionedFile: (filePath: string) => void;
}

export function UserMessageText({
	message,
	workspaceCwd,
	onOpenMentionedFile,
}: UserMessageTextProps) {
	return message.content.map((part: MastraMessagePart, partIndex: number) => {
		if (part.type !== "text") {
			return null;
		}

		const mentionSegments = parseUserMentions(part.text);
		return (
			<div
				key={`${message.id}-${partIndex}`}
				className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap"
			>
				{mentionSegments.map((segment, segmentIndex) => {
					if (segment.type === "text") {
						return (
							<span
								key={`${message.id}-${partIndex}-${segmentIndex}`}
								className="whitespace-pre-wrap break-words"
							>
								{segment.value}
							</span>
						);
					}

					const normalizedPath = normalizeWorkspaceFilePath({
						filePath: segment.relativePath,
						workspaceRoot: workspaceCwd,
					});
					const canOpen = Boolean(normalizedPath);

					return (
						<button
							type="button"
							key={`${message.id}-${partIndex}-${segmentIndex}`}
							className="mx-0.5 inline-flex items-center gap-0.5 rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary transition-colors hover:bg-primary/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-default disabled:opacity-60"
							onClick={() => {
								if (!normalizedPath) return;
								onOpenMentionedFile(normalizedPath);
							}}
							disabled={!canOpen}
							aria-label={`Open file ${segment.relativePath}`}
						>
							<span className="font-semibold text-primary">@</span>
							<span className="text-primary/95">{segment.relativePath}</span>
						</button>
					);
				})}
			</div>
		);
	});
}
