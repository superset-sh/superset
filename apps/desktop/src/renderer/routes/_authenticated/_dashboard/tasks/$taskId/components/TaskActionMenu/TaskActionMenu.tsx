import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useState } from "react";
import {
	HiEllipsisHorizontal,
	HiOutlineDocumentDuplicate,
	HiOutlineTrash,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import type { TaskWithStatus } from "../../../components/TasksView/hooks/useTasksTable";

interface TaskActionMenuProps {
	task: TaskWithStatus;
	onDelete?: () => void;
}

export function TaskActionMenu({ task, onDelete }: TaskActionMenuProps) {
	const { t } = useLingui();
	const { tasks: taskActions } = useOptimisticActions();
	const [open, setOpen] = useState(false);

	const { copyToClipboard } = useCopyToClipboard();

	const handleCopyId = () => {
		copyToClipboard(task.slug);
		setOpen(false);
	};

	const handleCopyTitle = () => {
		copyToClipboard(task.title);
		setOpen(false);
	};

	const handleDelete = () => {
		const transaction = taskActions.deleteTask(task.id);
		if (transaction) {
			setOpen(false);
			onDelete?.();
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					aria-label={t({
						message: "Open task actions",
					})}
				>
					<HiEllipsisHorizontal className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuItem onSelect={handleCopyId}>
					<HiOutlineDocumentDuplicate className="size-4" />
					<span>
						<Trans>Copy ID</Trans>
					</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={handleCopyTitle}>
					<HiOutlineDocumentDuplicate className="size-4" />
					<span>
						<Trans>Copy Title</Trans>
					</span>
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					onSelect={handleDelete}
					className="text-destructive focus:text-destructive"
				>
					<HiOutlineTrash className="text-destructive size-4" />
					<span>
						<Trans>Delete</Trans>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
