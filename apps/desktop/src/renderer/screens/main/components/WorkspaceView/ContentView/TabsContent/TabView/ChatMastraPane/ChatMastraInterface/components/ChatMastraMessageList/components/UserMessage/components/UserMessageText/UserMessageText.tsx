import { normalizeWorkspaceFilePath } from "../../../../../../../../ChatPane/ChatInterface/utils/file-paths";
import { FileMentionChip } from "../../../../../../../../components/FileMentionChip";
import { LinkedTaskChip } from "../../../../../../../../components/LinkedTaskChip";
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
		const taskMentions = mentionSegments.filter(
			(s) => s.type === "task-mention",
		);
		const otherSegments = mentionSegments.filter(
			(s) => s.type !== "task-mention",
		);
		const hasNonTaskContent = otherSegments.some(
			(s) => (s.type === "text" && s.value.trim()) || s.type === "file-mention",
		);

		return (
			<div
				key={`${message.id}-${partIndex}`}
				className="flex max-w-[85%] flex-col items-end gap-2"
			>
				{taskMentions.length > 0 && (
					<div className="flex flex-wrap justify-end gap-2">
						{taskMentions.map((segment, segmentIndex) => (
							<LinkedTaskChip
								key={`${message.id}-${partIndex}-task-${segmentIndex}`}
								slug={segment.slug}
							/>
						))}
					</div>
				)}
				{hasNonTaskContent && (
					<div className="rounded-lg bg-muted px-4 py-2.5 text-sm text-foreground whitespace-pre-wrap">
						{otherSegments.map((segment, segmentIndex) => {
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

							if (segment.type === "file-mention") {
								const normalizedPath = normalizeWorkspaceFilePath({
									filePath: segment.relativePath,
									workspaceRoot: workspaceCwd,
								});
								const canOpen = Boolean(normalizedPath);

								return (
									<FileMentionChip
										key={`${message.id}-${partIndex}-${segmentIndex}`}
										relativePath={segment.relativePath}
										disabled={!canOpen}
										onClick={() => {
											if (!normalizedPath) return;
											onOpenMentionedFile(normalizedPath);
										}}
									/>
								);
							}

							return null;
						})}
					</div>
				)}
			</div>
		);
	});
}
