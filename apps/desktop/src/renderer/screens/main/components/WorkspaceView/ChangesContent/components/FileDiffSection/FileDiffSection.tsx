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
import { useDiffEditorPool } from "../DiffEditorPool";
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

const VISIBILITY_MARGIN = "200px 0px";

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
	const editorContainerRef = useRef<HTMLDivElement>(null);
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
	const [isNearViewport, setIsNearViewport] = useState(false);
	const [hasEditor, setHasEditor] = useState(false);

	const pool = useDiffEditorPool();
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

		const activeObserver = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
					setActiveFileKey(fileKey);
				}
			},
			{
				root: container,
				rootMargin: "-100px 0px -60% 0px",
				threshold: [0.1],
			},
		);

		const visibilityObserver = new IntersectionObserver(
			([entry]) => setIsNearViewport(entry.isIntersecting),
			{ root: container, rootMargin: VISIBILITY_MARGIN },
		);

		activeObserver.observe(element);
		visibilityObserver.observe(element);

		return () => {
			activeObserver.disconnect();
			visibilityObserver.disconnect();
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

	// Acquire/release editor from pool based on visibility
	useEffect(() => {
		if (!pool || !editorContainerRef.current) return;

		const shouldHaveEditor = isExpanded && isNearViewport && diffData;

		if (shouldHaveEditor && !hasEditor) {
			const editor = pool.acquireEditor(
				fileKey,
				editorContainerRef.current,
				diffData,
				{ viewMode: diffViewMode, hideUnchangedRegions },
			);
			if (editor) {
				setHasEditor(true);
			}
		} else if (!shouldHaveEditor && hasEditor) {
			pool.releaseEditor(fileKey);
			setHasEditor(false);
		}
	}, [
		pool,
		fileKey,
		isExpanded,
		isNearViewport,
		diffData,
		hasEditor,
		diffViewMode,
		hideUnchangedRegions,
	]);

	// Release editor on unmount
	useEffect(() => {
		return () => {
			if (pool && hasEditor) {
				pool.releaseEditor(fileKey);
			}
		};
	}, [pool, fileKey, hasEditor]);

	// Update options when they change
	useEffect(() => {
		if (pool && hasEditor) {
			pool.updateOptions({ viewMode: diffViewMode, hideUnchangedRegions });
		}
	}, [pool, hasEditor, diffViewMode, hideUnchangedRegions]);

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
						<div className="bg-background min-h-24">
							<div
								ref={editorContainerRef}
								className="w-full"
								style={{ minHeight: hasEditor ? "auto" : 96 }}
							/>
							{!hasEditor && (
								<div className="flex items-center justify-center h-24 text-muted-foreground absolute inset-0">
									<LuLoader className="w-4 h-4 animate-spin mr-2" />
									<span>Loading editor...</span>
								</div>
							)}
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
