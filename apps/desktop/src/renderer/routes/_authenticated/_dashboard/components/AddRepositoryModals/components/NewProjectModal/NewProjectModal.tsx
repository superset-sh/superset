import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { ParentDirectoryPicker } from "../ParentDirectoryPicker";

interface NewProjectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: (result: { projectId: string; repoPath: string }) => void;
	onError?: (message: string) => void;
}

export function NewProjectModal({
	open,
	onOpenChange,
	onSuccess,
	onError,
}: NewProjectModalProps) {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [parentDir, setParentDir] = useState<string | null>(null);
	const [working, setWorking] = useState(false);

	const trimmedName = name.trim();
	const trimmedUrl = url.trim();
	const canSubmit =
		trimmedName.length > 0 &&
		trimmedUrl.length > 0 &&
		parentDir !== null &&
		!working;

	const reset = () => {
		setName("");
		setUrl("");
		setParentDir(null);
		setWorking(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && working) return;
		if (!next) reset();
		onOpenChange(next);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit || !activeHostUrl || !parentDir) return;

		setWorking(true);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name: trimmedName,
				visibility: "private",
				mode: { kind: "clone", parentDir, url: trimmedUrl },
			});
			ensureProjectInSidebar(result.projectId);
			queryClient.invalidateQueries({
				queryKey: ["project", "list", activeHostUrl],
			});
			onSuccess?.(result);
			reset();
			onOpenChange(false);
		} catch (err) {
			onError?.(err instanceof Error ? err.message : String(err));
			setWorking(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New project</DialogTitle>
						<DialogDescription>
							Clone a GitHub repository into a local folder and register it as a
							new project in this organization.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 py-4">
						<div className="space-y-1">
							<Label htmlFor="new-project-name">Name</Label>
							<Input
								id="new-project-name"
								autoFocus
								value={name}
								onChange={(event) => setName(event.target.value)}
								disabled={working}
								placeholder="e.g. my-project"
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="new-project-url">Clone URL</Label>
							<Input
								id="new-project-url"
								value={url}
								onChange={(event) => setUrl(event.target.value)}
								disabled={working}
								placeholder="https://github.com/owner/name.git"
							/>
						</div>
						<div className="space-y-1">
							<Label>Parent directory</Label>
							<ParentDirectoryPicker
								value={parentDir}
								onChange={setParentDir}
								disabled={working}
								dialogTitle="Select where to clone the project"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={working}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							{working ? "Creating…" : "Create project"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
