import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { ScrollArea } from "@superset/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import type React from "react";
import type { Worktree } from "shared/types";
import { Avatar } from "../Avatar";
import type { TaskStatus } from "../StatusIndicator";

interface TaskFormProps {
	newTaskName: string;
	onTaskNameChange: (value: string) => void;
	newTaskDescription: string;
	onTaskDescriptionChange: (value: string) => void;
	newTaskStatus: TaskStatus;
	onTaskStatusChange: (value: TaskStatus) => void;
	newTaskAssignee: string;
	onTaskAssigneeChange: (value: string) => void;
	newTaskBranch: string;
	onTaskBranchChange: (value: string) => void;
	sourceBranch: string;
	onSourceBranchChange: (value: string) => void;
	cloneTabsFromWorktreeId: string;
	onCloneTabsFromWorktreeIdChange: (value: string) => void;
	branches: string[];
	worktrees: Worktree[];
	onSubmit: (e: React.FormEvent) => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({
	newTaskName,
	onTaskNameChange,
	newTaskDescription,
	onTaskDescriptionChange,
	newTaskStatus,
	onTaskStatusChange,
	newTaskAssignee,
	onTaskAssigneeChange,
	newTaskBranch,
	onTaskBranchChange,
	sourceBranch,
	onSourceBranchChange,
	cloneTabsFromWorktreeId,
	onCloneTabsFromWorktreeIdChange,
	branches,
	worktrees,
	onSubmit,
}) => {
	return (
		<form
			onSubmit={onSubmit}
			className="flex-1 flex flex-col min-h-0 overflow-hidden"
		>
			<ScrollArea className="flex-1 min-h-0">
				<div className="px-6 pt-6 space-y-4 pb-4">
					{/* Title section */}
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="task-name">Title</Label>
							<Input
								id="task-name"
								placeholder="My new feature"
								value={newTaskName}
								onChange={(e) => onTaskNameChange(e.target.value)}
								autoFocus
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="task-description">
								Description{" "}
								<span className="text-muted-foreground font-normal">(Optional)</span>
							</Label>
							<Textarea
								id="task-description"
								placeholder="What is the goal of this worktree?"
								value={newTaskDescription}
								onChange={(e) => onTaskDescriptionChange(e.target.value)}
								rows={3}
								className="resize-none"
							/>
						</div>
					</div>

					{/* Worktree creation options */}
					{(branches.length > 0 || worktrees.length > 0) && (
						<div className="space-y-3 pt-4">
							{branches.length > 0 && (
								<div className="space-y-2">
									<Label htmlFor="source-branch">Create From Branch</Label>
									<select
										id="source-branch"
										value={sourceBranch}
										onChange={(e) => onSourceBranchChange(e.target.value)}
										className="flex h-9 w-full rounded-md border border-neutral-700 bg-neutral-900/50 px-3 py-1 text-sm text-neutral-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{branches.map((branch) => (
											<option key={branch} value={branch}>
												{branch}
											</option>
										))}
									</select>
								</div>
							)}

							{worktrees.length > 0 && (
								<div className="space-y-2">
									<Label htmlFor="clone-tabs">Clone Tabs From</Label>
									<select
										id="clone-tabs"
										value={cloneTabsFromWorktreeId}
										onChange={(e) => onCloneTabsFromWorktreeIdChange(e.target.value)}
										className="flex h-9 w-full rounded-md border border-neutral-700 bg-neutral-900/50 px-3 py-1 text-sm text-neutral-200 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
									>
										<option value="">Don't clone tabs</option>
										{worktrees.map((worktree) => (
											<option key={worktree.id} value={worktree.id}>
												{worktree.branch} ({worktree.tabs.length} tab
												{worktree.tabs.length !== 1 ? "s" : ""})
											</option>
										))}
									</select>
								</div>
							)}

							<div className="space-y-2">
								<Label htmlFor="branch-name">Branch Name</Label>
								<Input
									id="branch-name"
									type="text"
									placeholder="Auto-generated from title"
									value={newTaskBranch}
									onChange={(e) => onTaskBranchChange(e.target.value)}
								/>
							</div>
						</div>
					)}

					{/* Metadata section */}
					<div className="flex items-center gap-3">
						{/* Status */}
						<Select
							value={newTaskStatus}
							onValueChange={(value) => onTaskStatusChange(value as TaskStatus)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="planning">Planning</SelectItem>
								<SelectItem value="needs-feedback">Needs Feedback</SelectItem>
								<SelectItem value="ready-to-merge">Ready to Merge</SelectItem>
							</SelectContent>
						</Select>

						{/* Assignee */}
						<Select value={newTaskAssignee} onValueChange={onTaskAssigneeChange}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="You" className="px-3">
									<div className="flex items-center gap-2">
										<Avatar
											imageUrl="https://i.pravatar.cc/150?img=1"
											name="You"
											size={16}
										/>
										<span>You</span>
									</div>
								</SelectItem>
								<SelectSeparator />
								<SelectGroup>
									<SelectLabel>Agents</SelectLabel>
									<SelectItem value="Claude" className="px-3">
										<div className="flex items-center gap-2">
											<Avatar
												imageUrl="https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg"
												name="Claude"
												size={16}
											/>
											<span>Claude</span>
										</div>
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				</div>
			</ScrollArea>
			{/* Footer for new task form */}
			<div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between gap-2 shrink-0">
				<Button type="submit" disabled={!newTaskName.trim()} className="ml-auto">
					Create task
				</Button>
			</div>
		</form>
	);
};

