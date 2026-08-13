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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useProjectQueryTargets } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";

interface CreateFactoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (factoryId: string) => void;
}

export function CreateFactoryDialog({
	open,
	onOpenChange,
	onCreated,
}: CreateFactoryDialogProps) {
	const { targets, projects } = useProjectQueryTargets([]);
	const [name, setName] = useState("");
	const [projectId, setProjectId] = useState<string>("");
	const [repoFullName, setRepoFullName] = useState("");
	const [defaultAgent, setDefaultAgent] = useState("claude");

	const selectedTarget = targets.find((t) => t.projectId === projectId);

	const create = useMutation({
		mutationFn: () =>
			apiTrpcClient.factory.create.mutate({
				name: name.trim(),
				v2ProjectId: projectId,
				repoFullName: repoFullName.trim(),
				targetHostId: selectedTarget?.hostId ?? undefined,
				defaultAgent: defaultAgent.trim(),
			}),
		onSuccess: (factory) => {
			toast.success(`Factory "${factory.name}" created`);
			onOpenChange(false);
			setName("");
			setRepoFullName("");
			onCreated(factory.id);
		},
		onError: (error) => toast.error(error.message),
	});

	const canSubmit =
		name.trim().length > 0 &&
		projectId.length > 0 &&
		/^[\w.-]+\/[\w.-]+$/.test(repoFullName.trim()) &&
		defaultAgent.trim().length > 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New factory</DialogTitle>
					<DialogDescription>
						An issue→PR pipeline over one repo. Stage agents run in workspaces
						on your hosts.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="factory-name">Name</Label>
						<Input
							id="factory-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="ai-sdk factory"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Project</Label>
						<Select
							value={projectId}
							onValueChange={(value) => {
								setProjectId(value);
								const project = projects.find((p) => p.projectKey === value);
								// Prefill only untouched fields — never clobber typed input.
								if (
									!repoFullName.trim() &&
									project?.repoOwner &&
									project.repoName
								) {
									setRepoFullName(`${project.repoOwner}/${project.repoName}`);
								}
								if (!name.trim() && project) {
									setName(`${project.name} factory`);
								}
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select a project" />
							</SelectTrigger>
							<SelectContent>
								{targets.map((target) => (
									<SelectItem key={target.projectId} value={target.projectId}>
										{target.projectName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="factory-repo">GitHub repo (owner/repo)</Label>
						<Input
							id="factory-repo"
							value={repoFullName}
							onChange={(event) => setRepoFullName(event.target.value)}
							placeholder="vercel/ai"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="factory-agent">Default agent</Label>
						<Input
							id="factory-agent"
							value={defaultAgent}
							onChange={(event) => setDefaultAgent(event.target.value)}
							placeholder="claude"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={!canSubmit || create.isPending}
						onClick={() => create.mutate()}
					>
						Create factory
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
