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
import { useState } from "react";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import {
	resolveCreateWorkspaceHostUrl,
	type WorkspaceHostTarget,
} from "renderer/lib/v2-workspace-host";
import type { V2SidebarProject } from "../../types";
import { HostTargetPicker } from "./components/HostTargetPicker";
import { useWorkspaceHostOptions } from "./hooks/useWorkspaceHostOptions";

interface CreateWorkspaceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projects: V2SidebarProject[];
}

interface CreateWorkspaceFormState {
	projectId: string;
	name: string;
	branch: string;
	hostTarget: WorkspaceHostTarget;
}

const DEFAULT_FORM_STATE: CreateWorkspaceFormState = {
	projectId: "",
	name: "",
	branch: "",
	hostTarget: { kind: "local" },
};

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
	projects,
}: CreateWorkspaceDialogProps) {
	const [formState, setFormState] =
		useState<CreateWorkspaceFormState>(DEFAULT_FORM_STATE);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { currentDeviceName, localHostService, otherDevices } =
		useWorkspaceHostOptions();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (
			!formState.projectId ||
			!formState.name.trim() ||
			!formState.branch.trim()
		) {
			return;
		}

		const hostUrl = resolveCreateWorkspaceHostUrl(
			formState.hostTarget,
			localHostService?.url ?? null,
		);
		if (!hostUrl) {
			toast.error("Host service not available");
			return;
		}

		const client: HostServiceClient =
			formState.hostTarget.kind === "local" && localHostService
				? localHostService.client
				: getHostServiceClientByUrl(hostUrl);

		setIsSubmitting(true);
		try {
			await client.workspace.create.mutate({
				projectId: formState.projectId,
				name: formState.name.trim(),
				branch: formState.branch.trim(),
			});
			toast.success(`Workspace "${formState.name.trim()}" created`);
			setFormState(DEFAULT_FORM_STATE);
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
							<Select
								value={formState.projectId}
								onValueChange={(projectId) =>
									setFormState((current) => ({ ...current, projectId }))
								}
							>
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
								value={formState.name}
								onChange={(e) =>
									setFormState((current) => ({
										...current,
										name: e.target.value,
									}))
								}
								placeholder="feature-login"
							/>
						</div>
						<div className="space-y-2">
							<Label>Host</Label>
							<HostTargetPicker
								currentDeviceName={currentDeviceName}
								hostTarget={formState.hostTarget}
								onHostTargetChange={(hostTarget) =>
									setFormState((current) => ({ ...current, hostTarget }))
								}
								otherDevices={otherDevices}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="workspace-branch">Branch</Label>
							<Input
								id="workspace-branch"
								value={formState.branch}
								onChange={(e) =>
									setFormState((current) => ({
										...current,
										branch: e.target.value,
									}))
								}
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
								!formState.projectId ||
								!formState.name.trim() ||
								!formState.branch.trim() ||
								isSubmitting
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
