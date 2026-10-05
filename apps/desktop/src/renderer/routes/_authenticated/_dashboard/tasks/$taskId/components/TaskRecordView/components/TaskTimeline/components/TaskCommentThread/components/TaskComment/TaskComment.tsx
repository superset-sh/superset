import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import { LuEllipsis, LuPencil, LuTrash2 } from "react-icons/lu";
import { RichText } from "renderer/components/RichText";
import { CloudWorkspacePersonLink } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePersonLink";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import type { TaskComment as TaskCommentValue } from "../../../../../../../../types";
import { TaskCommentComposer } from "../../../TaskCommentComposer";

interface TaskCommentProps {
	comment: TaskCommentValue;
	now: Date;
	isOwn: boolean;
	hasReplies: boolean;
	onOpenPerson: (userId: string) => void;
	onEdit: (body: string) => Promise<void>;
	onDelete: () => void;
}

export function TaskComment({
	comment,
	now,
	isOwn,
	hasReplies,
	onOpenPerson,
	onEdit,
	onDelete,
}: TaskCommentProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	const [isEditing, setIsEditing] = useState(false);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const isSaved = !comment.id.startsWith("pending:");
	const author = comment.author;

	return (
		<div className="group/comment flex gap-3">
			<span className="flex h-6 w-8 shrink-0 items-center justify-center">
				{author && (
					<AvatarStack
						people={[
							{ id: author.userId, name: author.name, image: author.image },
						]}
						size={20}
					/>
				)}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex min-h-6 items-center gap-1.5 text-[13px]">
					{author ? (
						<CloudWorkspacePersonLink
							person={author}
							showAvatar={false}
							className="-ml-1"
							onOpen={onOpenPerson}
						/>
					) : (
						<span className="font-medium">
							<Trans>Deleted user</Trans>
						</span>
					)}
					<span className="text-muted-foreground">
						{formatCompactRelativeTime(
							comment.at,
							comment.at > now ? comment.at : now,
						)}
						{comment.editedAt && (
							<>
								{" "}
								<Trans>(edited)</Trans>
							</>
						)}
					</span>
					{isOwn && isSaved && !isEditing && (
						<DropdownMenu modal={false}>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={t({ message: "Comment actions" })}
									className="ml-auto size-6 text-muted-foreground opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
								>
									<LuEllipsis className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-32">
								<DropdownMenuItem onSelect={() => setIsEditing(true)}>
									<LuPencil className="size-4" />
									<Trans>Edit</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem
									variant="destructive"
									onSelect={() => setIsConfirmingDelete(true)}
								>
									<LuTrash2 className="size-4" />
									<Trans>Delete</Trans>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
				{isEditing ? (
					<TaskCommentComposer
						initialBody={comment.body}
						placeholder={t({ message: "Edit your comment…" })}
						submitLabel={t({ message: "Save" })}
						autoFocus
						className="mt-1"
						onSubmit={async (body) => {
							await onEdit(body);
							setIsEditing(false);
						}}
						onCancel={() => setIsEditing(false)}
					/>
				) : (
					<RichText
						value={comment.body}
						editable={false}
						className="mt-0.5"
						editorClassName="text-[13.5px] leading-normal text-foreground"
					/>
				)}
			</div>
			<DiscardConfirmDialog
				open={isConfirmingDelete}
				onOpenChange={setIsConfirmingDelete}
				title={t({ message: "Delete this comment?" })}
				description={
					hasReplies
						? t({ message: "Its replies go with it." })
						: t({ message: "It can't be brought back." })
				}
				confirmLabel={t({ message: "Delete" })}
				onConfirm={() => {
					setIsConfirmingDelete(false);
					onDelete();
				}}
			/>
		</div>
	);
}
