import type { DefinitionSummary } from "@superset/shared/agent-library";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export function DeleteDefinitionSection({
	summary,
	onDeleted,
}: {
	summary: DefinitionSummary;
	onDeleted: () => void;
}) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;

	const removeMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: `delete the ${summary.kind}`,
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).agentLibrary.remove.mutate({
				scopeKey: summary.scopeKey,
				kind: summary.kind,
				name: summary.name,
			});
		},
		onSuccess: () => {
			toast.success(`Deleted ${summary.kind} "${summary.name}".`);
			onDeleted();
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to delete"),
	});

	return (
		<section className="border-t pt-6">
			<h3 className="text-sm font-medium text-destructive">Danger zone</h3>
			<div className="mt-3 flex items-center justify-between gap-3">
				<p className="text-xs text-muted-foreground">
					{summary.kind === "skill"
						? "Deletes the whole skill folder, including its assets."
						: "Deletes the agent definition file."}{" "}
					This cannot be undone.
				</p>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							variant="destructive"
							size="sm"
							disabled={removeMutation.isPending}
						>
							<Trash2 className="size-3.5 mr-1" />
							Delete
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Delete {summary.kind} "{summary.name}"?
							</AlertDialogTitle>
							<AlertDialogDescription>
								{summary.kind === "skill"
									? `The folder ${summary.relativePath.replace("/SKILL.md", "")} and everything in it will be permanently deleted.`
									: `${summary.relativePath} will be permanently deleted.`}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={() => removeMutation.mutate()}>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</section>
	);
}
