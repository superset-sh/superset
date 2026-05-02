import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { VersionRow } from "./components/VersionRow";

interface VersionHistorySheetProps {
	automationId: string;
	automationName: string;
	currentPrompt: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function VersionHistorySheet({
	automationId,
	automationName,
	currentPrompt,
	open,
	onOpenChange,
}: VersionHistorySheetProps) {
	const queryClient = useQueryClient();
	const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
		null,
	);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const versionsQueryKey = useMemo(
		() => ["automation-versions", automationId] as const,
		[automationId],
	);

	const { data: versions = [], isLoading } = useQuery({
		queryKey: versionsQueryKey,
		queryFn: () =>
			apiTrpcClient.automation.versions.list.query({ automationId }),
		enabled: open,
	});

	useEffect(() => {
		if (!open) {
			setSelectedVersionId(null);
			return;
		}
		if (versions.length > 0 && !selectedVersionId) {
			setSelectedVersionId(versions[0].id);
		}
	}, [open, versions, selectedVersionId]);

	const { data: selectedContent } = useQuery({
		queryKey: ["automation-version-content", selectedVersionId],
		queryFn: async () => {
			if (!selectedVersionId) return null;
			return apiTrpcClient.automation.versions.getContent.query({
				versionId: selectedVersionId,
			});
		},
		enabled: !!selectedVersionId,
	});

	const restoreMutation = useMutation({
		mutationFn: (versionId: string) =>
			apiTrpcClient.automation.versions.restore.mutate({ versionId }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: versionsQueryKey });
			queryClient.invalidateQueries({ queryKey: ["automation", automationId] });
			toast.success("Prompt restored");
			setConfirmOpen(false);
			onOpenChange(false);
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to restore");
		},
	});

	const previewContent = selectedContent?.content ?? currentPrompt;

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					className="flex h-[88vh] w-[calc(100%-2rem)] max-w-[1400px] flex-row gap-0 overflow-hidden p-0 sm:max-w-[1400px]"
					showCloseButton={false}
					aria-describedby={undefined}
				>
					<DialogTitle className="sr-only">
						Version history for {automationName}
					</DialogTitle>

					<div className="flex flex-1 flex-col overflow-hidden">
						<div className="border-b px-8 py-5">
							<h1 className="text-2xl font-semibold">{automationName}</h1>
						</div>
						<div className="flex-1 overflow-y-auto px-8 py-6">
							<MarkdownRenderer content={previewContent} />
						</div>
					</div>

					<aside className="flex w-80 shrink-0 flex-col border-l bg-background">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<h2 className="text-base font-semibold">Version history</h2>
							<DialogClose asChild>
								<Button variant="ghost" size="icon-sm" aria-label="Close">
									<LuX className="size-4" />
								</Button>
							</DialogClose>
						</div>

						<div className="flex-1 overflow-y-auto">
							{isLoading && (
								<div className="p-4 text-sm text-muted-foreground">
									Loading...
								</div>
							)}
							{!isLoading && versions.length === 0 && (
								<div className="p-4 text-sm text-muted-foreground">
									No versions yet.
								</div>
							)}
							{versions.map((version) => (
								<VersionRow
									key={version.id}
									authorName={version.authorName}
									authorImage={version.authorImage}
									source={version.source}
									updatedAt={new Date(version.updatedAt)}
									selected={selectedVersionId === version.id}
									onSelect={() => setSelectedVersionId(version.id)}
								/>
							))}
						</div>

						<div className="flex items-center justify-end border-t px-4 py-3">
							<Button
								disabled={!selectedVersionId || restoreMutation.isPending}
								onClick={() => setConfirmOpen(true)}
							>
								Restore
							</Button>
						</div>
					</aside>
				</DialogContent>
			</Dialog>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Restore this version?</AlertDialogTitle>
						<AlertDialogDescription>
							The current prompt will be replaced with the selected version. A
							new "Restored" entry will be added to history so you can undo
							this.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={restoreMutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={!selectedVersionId || restoreMutation.isPending}
							onClick={() => {
								if (selectedVersionId) {
									restoreMutation.mutate(selectedVersionId);
								}
							}}
						>
							Restore
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
