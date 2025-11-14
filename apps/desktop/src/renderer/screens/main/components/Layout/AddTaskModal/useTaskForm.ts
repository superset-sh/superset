import { useCallback, useEffect, useState } from "react";
import type { TaskStatus } from "../StatusIndicator";
import type { Worktree } from "shared/types";
import { generateBranchNameWithCollisionAvoidance } from "./utils";

export function useTaskForm(
	isOpen: boolean,
	mode: "list" | "new",
	branches: string[],
	worktrees: Worktree[],
) {
	const [newTaskName, setNewTaskName] = useState("");
	const [newTaskDescription, setNewTaskDescription] = useState("");
	const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("planning");
	const [newTaskAssignee, setNewTaskAssignee] = useState("You");
	const [newTaskBranch, setNewTaskBranch] = useState("");
	const [sourceBranch, setSourceBranch] = useState("");
	const [cloneTabsFromWorktreeId, setCloneTabsFromWorktreeId] = useState("");
	const [isBranchManuallyEdited, setIsBranchManuallyEdited] = useState(false);

	// Auto-generate branch name from task name (only if not manually edited)
	useEffect(() => {
		if (!isBranchManuallyEdited && newTaskName) {
			const branchName = generateBranchNameWithCollisionAvoidance(newTaskName);
			setNewTaskBranch(branchName);
		} else if (!newTaskName) {
			setNewTaskBranch("");
			setIsBranchManuallyEdited(false);
		}
	}, [newTaskName, isBranchManuallyEdited]);

	// Initialize source branch when modal opens or branches change
	useEffect(() => {
		if (isOpen && mode === "new" && branches.length > 0) {
			const mainBranch = branches.find((b) => b.toLowerCase() === "main");
			const masterBranch = branches.find((b) => b.toLowerCase() === "master");
			const preferredBranch = mainBranch || masterBranch || branches[0];

			if (!sourceBranch || !branches.includes(sourceBranch)) {
				setSourceBranch(preferredBranch);
			}
		}
	}, [isOpen, mode, branches, sourceBranch]);

	// Auto-select worktree to clone tabs from if it matches the source branch
	useEffect(() => {
		if (sourceBranch && worktrees.length > 0) {
			const matchingWorktree = worktrees.find((wt) => wt.branch === sourceBranch);
			if (matchingWorktree) {
				setCloneTabsFromWorktreeId(matchingWorktree.id);
			} else {
				setCloneTabsFromWorktreeId("");
			}
		} else {
			setCloneTabsFromWorktreeId("");
		}
	}, [sourceBranch, worktrees]);

	// Reset form when modal closes
	useEffect(() => {
		if (!isOpen) {
			setNewTaskName("");
			setNewTaskDescription("");
			setNewTaskStatus("planning");
			setNewTaskAssignee("You");
			setNewTaskBranch("");
			setIsBranchManuallyEdited(false);
			setSourceBranch("");
			setCloneTabsFromWorktreeId("");
		} else if (isOpen && mode === "new") {
			setSourceBranch("");
		}
	}, [isOpen, mode]);

	const handleTaskBranchChange = useCallback((value: string) => {
		setNewTaskBranch(value);
		setIsBranchManuallyEdited(true);
	}, []);

	return {
		newTaskName,
		setNewTaskName,
		newTaskDescription,
		setNewTaskDescription,
		newTaskStatus,
		setNewTaskStatus,
		newTaskAssignee,
		setNewTaskAssignee,
		newTaskBranch,
		setNewTaskBranch: handleTaskBranchChange,
		sourceBranch,
		setSourceBranch,
		cloneTabsFromWorktreeId,
		setCloneTabsFromWorktreeId,
	};
}

