import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import {
	getStatusColor,
	getStatusIndicator,
} from "../../../Sidebar/ChangesView/utils";
import { createFileKey, useScrollContext } from "../../context";
import { DiffViewer } from "../DiffViewer";
import { FileDiffHeader } from "./components/FileDiffHeader";

interface FileDiffSectionProps {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	worktreePath: string;
	baseBranch?: string;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	isActioning?: boolean;
}

export function FileDiffSection({
	file,
	category,
	commitHash,
	worktreePath,
	baseBranch,
	isExpanded,
	onToggleExpanded,
	onStage,
	onUnstage,
	onDiscard,
	isActioning = false,
}: FileDiffSectionProps) {
	const sectionRef = useRef<HTMLDivElement>(null);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const {
		registerFileRef,
		viewedFiles,
		setFileViewed,
		setActiveFileKey,
		containerRef,
	} = useScrollContext();
	const { viewMode: diffViewMode, hideUnchangedRegions } = useChangesStore();
	const [isCopied, setIsCopied] = useState(false);

	const fileKey = createFileKey(file, category, commitHash);
	const isViewed = viewedFiles.has(fileKey);

	const openInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();

	const handleOpenInEditor = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (worktreePath) {
				const absolutePath = `${worktreePath}/${file.path}`;
				openInEditorMutation.mutate({ path: absolutePath, cwd: worktreePath });
			}
		},
		[worktreePath, file.path, openInEditorMutation],
	);

	const handleCopyPath = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			navigator.clipboard
				.writeText(file.path)
				.then(() => {
					setIsCopied(true);
					if (copyTimeoutRef.current) {
						clearTimeout(copyTimeoutRef.current);
					}
					copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
				})
				.catch((err) => {
					console.error("[FileDiffSection/copyPath] Failed to copy:", err);
				});
		},
		[file.path],
	);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const handleViewedChange = useCallback(
		(checked: boolean) => {
			setFileViewed(fileKey, checked);
			if (checked && isExpanded) {
				onToggleExpanded();
			} else if (!checked && !isExpanded) {
				onToggleExpanded();
			}
		},
		[fileKey, setFileViewed, isExpanded, onToggleExpanded],
	);

	useEffect(() => {
		registerFileRef(file, category, commitHash, sectionRef.current);
		return () => {
			registerFileRef(file, category, commitHash, null);
		};
	}, [file, category, commitHash, registerFileRef]);

	useEffect(() => {
		const element = sectionRef.current;
		const container = containerRef.current;
		if (!element || !container) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
						setActiveFileKey(fileKey);
					}
				}
			},
			{
				root: container,
				rootMargin: "-100px 0px -60% 0px",
				threshold: [0.1],
			},
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [fileKey, setActiveFileKey, containerRef]);

	const { data: diffData, isLoading: isLoadingDiff } =
		electronTrpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				filePath: file.path,
				oldPath: file.oldPath,
				category,
				commitHash,
				defaultBranch: category === "against-base" ? baseBranch : undefined,
			},
			{
				enabled: isExpanded && !!worktreePath,
			},
		);

	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStats = file.additions > 0 || file.deletions > 0;

	return (
		<div
			ref={sectionRef}
			className="mx-2 my-2 border border-border rounded-lg overflow-hidden"
		>
			<Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
				<FileDiffHeader
					file={file}
					fileKey={fileKey}
					isExpanded={isExpanded}
					onToggleExpanded={onToggleExpanded}
					isViewed={isViewed}
					onViewedChange={handleViewedChange}
					statusBadgeColor={statusBadgeColor}
					statusIndicator={statusIndicator}
					showStats={showStats}
					onOpenInEditor={handleOpenInEditor}
					onCopyPath={handleCopyPath}
					isCopied={isCopied}
					onStage={onStage}
					onUnstage={onUnstage}
					onDiscard={onDiscard}
					isActioning={isActioning}
				/>

				<CollapsibleContent>
					{isLoadingDiff ? (
						<div className="flex items-center justify-center h-24 text-muted-foreground bg-background">
							<LuLoader className="w-4 h-4 animate-spin mr-2" />
							<span>Loading diff...</span>
						</div>
					) : diffData ? (
						<div className="bg-background">
							<DiffViewer
								contents={diffData}
								viewMode={diffViewMode}
								hideUnchangedRegions={hideUnchangedRegions}
								filePath={file.path}
								captureScroll={false}
								fitContent
							/>
						</div>
					) : (
						<div className="flex items-center justify-center h-24 text-muted-foreground bg-background">
							Unable to load diff
						</div>
					)}
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
