import type { RouterOutputs } from "@superset/api";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import type React from "react";
import { useState } from "react";

type Task = RouterOutputs["task"]["all"][number];

interface CreateTaskModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreate: (taskData: {
		title: string;
		description: string;
		status: Task["status"];
	}) => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
	isOpen,
	onClose,
	onCreate,
}) => {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [status, setStatus] = useState<Task["status"]>("backlog");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		onCreate({
			title: title.trim(),
			description: description.trim(),
			status,
		});

		// Reset form
		setTitle("");
		setDescription("");
		setStatus("backlog");
		onClose();
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-md bg-neutral-900 border-neutral-800/50 shadow-2xl">
				<DialogHeader className="border-b border-neutral-800/50 pb-5">
					<DialogTitle className="text-lg font-semibold text-white tracking-tight">
						Create New Task
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-5 py-5">
					{/* Title */}
					<div className="space-y-2">
						<Label
							htmlFor="title"
							className="text-sm font-semibold text-neutral-300"
						>
							Title
						</Label>
						<Input
							id="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Enter task title..."
							className="bg-neutral-800/50 border-neutral-700/50 text-white placeholder:text-neutral-500 focus:border-blue-600/50 focus:ring-blue-600/20"
							autoFocus
						/>
					</div>

					{/* Description */}
					<div className="space-y-2">
						<Label
							htmlFor="description"
							className="text-sm font-semibold text-neutral-300"
						>
							Description
						</Label>
						<textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Enter task description..."
							className="w-full min-h-[100px] bg-neutral-800/50 border border-neutral-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600/50 transition-all"
						/>
					</div>

					{/* Status */}
					<div className="space-y-2">
						<Label
							htmlFor="status"
							className="text-sm font-semibold text-neutral-300"
						>
							Status
						</Label>
						<select
							id="status"
							value={status}
							onChange={(e) => setStatus(e.target.value as Task["status"])}
							className="w-full bg-neutral-800/50 border border-neutral-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600/50 transition-all"
						>
							<option value="backlog">Backlog</option>
							<option value="todo">Todo</option>
							<option value="planning">Pending</option>
							<option value="working">Working</option>
							<option value="needs-feedback">Needs Feedback</option>
							<option value="ready-to-merge">Ready to Merge</option>
							<option value="completed">Completed</option>
							<option value="canceled">Canceled</option>
						</select>
					</div>

					{/* Actions */}
					<div className="flex justify-end gap-3 pt-5 border-t border-neutral-800/50">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							className="text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-all"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={!title.trim()}
							className="bg-blue-600/90 hover:bg-blue-600 text-white shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
						>
							Create Task
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
};
