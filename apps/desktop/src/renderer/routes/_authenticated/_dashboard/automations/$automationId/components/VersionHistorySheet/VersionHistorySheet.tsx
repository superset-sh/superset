import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
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
		placeholderData: keepPreviousData,
	});

	const restoreMutation = useMutation({
		mutationFn: (versionId: string) =>
			apiTrpcClient.automation.versions.restore.mutate({ versionId }),
		onSuccess: (restored) => {
			queryClient.invalidateQueries({ queryKey: versionsQueryKey });
			setSelectedVersionId(restored?.id ?? null);
			toast.success("Prompt restored");
		},
	});

	const previewContent = selectedContent?.content ?? currentPrompt;

	const handleRestoreClick = () => {
		if (!selectedVersionId) return;
		const versionId = selectedVersionId;
		alert({
			title: "Restore this version?",
			description:
				'The current prompt will be replaced with the selected version. A new "Restored" entry will be added to history so you can undo this.',
			actions: [
				{ label: "Cancel", variant: "outline" },
				{
					label: "Restore",
					onClick: async () => {
						try {
							await restoreMutation.mutateAsync(versionId);
						} catch (error) {
							toast.error(
								error instanceof Error ? error.message : "Failed to restore",
							);
							throw error;
						}
					},
				},
			],
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="flex h-[88vh] w-[calc(100%-2rem)] max-w-[1400px] flex-row gap-0 overflow-hidden p-0 sm:max-w-[1400px]"
				showCloseButton={false}
				aria-describedby={undefined}
				onPointerDownOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogTitle className="sr-only">
					Version history for {automationName}
				</DialogTitle>

				<div className="flex flex-1 flex-col overflow-hidden">
					<div className="flex h-12 shrink-0 items-center border-b px-6">
						<h1 className="text-base font-semibold">{automationName}</h1>
					</div>
					<div className="flex-1 overflow-y-auto px-6 py-4">
						<MarkdownRenderer content={previewContent} />
					</div>
				</div>

				<aside className="flex w-60 shrink-0 flex-col border-l bg-background">
					<div className="flex h-12 shrink-0 items-center justify-between border-b pr-2 pl-4">
						<h2 className="text-base font-semibold">Version history</h2>
						<DialogClose asChild>
							<Button variant="ghost" size="icon-xs" aria-label="Close">
								<LuX className="size-3.5" />
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
							onClick={handleRestoreClick}
						>
							Restore
						</Button>
					</div>
				</aside>
			</DialogContent>
		</Dialog>
	);
}
