import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useEffect, useMemo, useState } from "react";
import { useV2ProjectList } from "renderer/routes/_authenticated/hooks/useV2ProjectList";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	useAddRepositoryDialogOpen,
	useAddRepositoryPreSelectedId,
	useCloseAddRepositoryDialog,
} from "renderer/stores/add-repository-dialog";
import { ProjectSetupStep } from "../ProjectSetupStep";

export function AddRepositoryDialog() {
	const isOpen = useAddRepositoryDialogOpen();
	const preSelectedProjectId = useAddRepositoryPreSelectedId();
	const closeDialog = useCloseAddRepositoryDialog();
	const { activeHostUrl } = useLocalHostService();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);

	const v2Projects = useV2ProjectList();

	const projectsWithRepo = useMemo(
		() => (v2Projects ?? []).filter((p) => p.githubOwner && p.githubRepoName),
		[v2Projects],
	);

	// Sync preselection from the store into local selection state each time
	// the dialog opens. Only apply if the project exists in the list.
	useEffect(() => {
		if (!isOpen) return;
		if (!preSelectedProjectId) return;
		if (!projectsWithRepo.some((p) => p.id === preSelectedProjectId)) return;
		setSelectedProjectId(preSelectedProjectId);
	}, [isOpen, preSelectedProjectId, projectsWithRepo]);

	const selectedProject = projectsWithRepo.find(
		(p) => p.id === selectedProjectId,
	);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			closeDialog();
			setSelectedProjectId(null);
		}
	};

	const handleSetupComplete = () => {
		closeDialog();
		setSelectedProjectId(null);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogHeader className="sr-only">
				<DialogTitle>Add Repository</DialogTitle>
				<DialogDescription>
					Set up a project repository on this device
				</DialogDescription>
			</DialogHeader>
			<DialogContent className="sm:max-w-[420px]">
				<div className="space-y-4">
					<div className="space-y-1">
						<h2 className="text-base font-semibold">Add Repository</h2>
						<p className="text-xs text-muted-foreground">
							Select a project and point it to a local checkout or clone it.
						</p>
					</div>

					<div className="space-y-2">
						<Label className="text-sm">Project</Label>
						<Select
							value={selectedProjectId ?? ""}
							onValueChange={setSelectedProjectId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a project..." />
							</SelectTrigger>
							<SelectContent>
								{projectsWithRepo.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										<span>{p.name}</span>
										{p.githubOwner && p.githubRepoName && (
											<span className="ml-2 text-muted-foreground text-xs">
												{p.githubOwner}/{p.githubRepoName}
											</span>
										)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{selectedProject && activeHostUrl && (
						<ProjectSetupStep
							projectId={selectedProject.id}
							projectName={selectedProject.name}
							hostUrl={activeHostUrl}
							onSetupComplete={handleSetupComplete}
							submitLabel="Add Repository"
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
