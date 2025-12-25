"use client";

import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

interface CreateTaskFormProps {
	organizationId: string;
}

export function CreateTaskForm({ organizationId }: CreateTaskFormProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState<
		"urgent" | "high" | "medium" | "low" | "none"
	>("none");

	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const createMutation = useMutation(
		trpc.task.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.task.byOrganization.queryKey(organizationId),
				});
				setTitle("");
				setPriority("none");
				setIsOpen(false);
			},
		}),
	);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;

		const slug = `TEST-${Date.now().toString(36).toUpperCase()}`;
		createMutation.mutate({
			slug,
			title: title.trim(),
			organizationId,
			priority,
			status: "Backlog",
		});
	};

	if (!isOpen) {
		return (
			<Button
				variant="outline"
				size="sm"
				onClick={() => setIsOpen(true)}
				className="gap-1"
			>
				<Plus className="size-4" />
				New Task
			</Button>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="flex items-center gap-2">
			<Input
				autoFocus
				placeholder="Task title..."
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				className="h-8 w-64"
			/>
			<Select
				value={priority}
				onValueChange={(v) =>
					setPriority(v as "urgent" | "high" | "medium" | "low" | "none")
				}
			>
				<SelectTrigger className="h-8 w-28">
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
			<Button type="submit" size="sm" disabled={createMutation.isPending}>
				{createMutation.isPending ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					"Create"
				)}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => setIsOpen(false)}
			>
				Cancel
			</Button>
		</form>
	);
}
