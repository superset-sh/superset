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
import { toast } from "@superset/ui/sonner";
import type { FormEvent } from "react";
import { useState } from "react";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";
import type { V2SidebarProject } from "../../types";

interface CreateWorkspaceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projects: V2SidebarProject[];
}

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
	projects,
}: CreateWorkspaceDialogProps) {
	const [projectId, setProjectId] = useState("");
	const [name, setName] = useState("");
	const [branch, setBranch] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { services } = useHostService();

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!projectId || !name.trim() || !branch.trim()) return;

		// Use first available host service (single-org assumption)
		const orgService = services.values().next().value;
		if (!orgService) {
			toast.error("Host service not available");
			return;
		}

		setIsSubmitting(true);
		try {
			await orgService.client.workspace.create.mutate({
				projectId,
				name: name.trim(),
				branch: branch.trim(),
			});
			toast.success(`Workspace "${name.trim()}" created`);
			setProjectId("");
			setName("");
			setBranch("");
			onOpenChange(false);
		} catch (err) {
			toast.error("Failed to create workspace", {
				description: err instanceof Error ? err.message : "Unknown error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[400px]">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New Workspace</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="workspace-project">Project</Label>
							<Select value={projectId} onValueChange={setProjectId}>
								<SelectTrigger id="workspace-project">
									<SelectValue placeholder="Select a project" />
								</SelectTrigger>
								<SelectContent>
									{projects.map((project) => (
										<SelectItem key={project.id} value={project.id}>
											{project.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="workspace-name">Name</Label>
							<Input
								id="workspace-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="feature-login"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="workspace-branch">Branch</Label>
							<Input
								id="workspace-branch"
								value={branch}
								onChange={(e) => setBranch(e.target.value)}
								placeholder="feature/login"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								!projectId || !name.trim() || !branch.trim() || isSubmitting
							}
						>
							{isSubmitting ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
