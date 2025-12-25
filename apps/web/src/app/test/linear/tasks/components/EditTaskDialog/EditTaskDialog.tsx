"use client";

import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { MarkdownEditor } from "../MarkdownEditor";

interface Task {
	id: string;
	slug: string;
	title: string;
	description?: string | null;
	status: string;
	priority: "urgent" | "high" | "medium" | "low" | "none";
	externalKey: string | null;
	organizationId: string;
}

interface EditTaskDialogProps {
	task: Task | null;
	onClose: () => void;
	organizationId: string;
}

const STATUSES = [
	"Backlog",
	"Todo",
	"In Progress",
	"In Review",
	"Done",
	"Canceled",
];

export function EditTaskDialog({
	task,
	onClose,
	organizationId,
}: EditTaskDialogProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [status, setStatus] = useState("");
	const [priority, setPriority] = useState<
		"urgent" | "high" | "medium" | "low" | "none"
	>("none");

	const trpc = useTRPC();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (task) {
			setTitle(task.title);
			setDescription(task.description ?? "");
			setStatus(task.status);
			setPriority(task.priority);
		}
	}, [task]);

	const updateMutation = useMutation(
		trpc.task.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.task.byOrganization.queryKey(organizationId),
				});
				onClose();
			},
		}),
	);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!task || !title.trim()) return;

		updateMutation.mutate({
			id: task.id,
			title: title.trim(),
			description: description || null,
			status,
			priority,
		});
	};

	return (
		<Dialog open={!!task} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						Edit Task{" "}
						<span className="text-muted-foreground font-mono text-sm">
							{task?.externalKey ?? task?.slug}
						</span>
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="title">Title</Label>
						<Input
							id="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<MarkdownEditor
							value={description}
							onChange={setDescription}
							height={300}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Status</Label>
							<Select value={status} onValueChange={setStatus}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUSES.map((s) => (
										<SelectItem key={s} value={s}>
											{s}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Priority</Label>
							<Select
								value={priority}
								onValueChange={(v) =>
									setPriority(
										v as "urgent" | "high" | "medium" | "low" | "none",
									)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No priority</SelectItem>
									<SelectItem value="urgent">Urgent</SelectItem>
									<SelectItem value="high">High</SelectItem>
									<SelectItem value="medium">Medium</SelectItem>
									<SelectItem value="low">Low</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={updateMutation.isPending}>
							{updateMutation.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								"Save Changes"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
