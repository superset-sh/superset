import { Alert, AlertDescription, AlertTitle } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuFileCode, LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CodeEditor } from "renderer/screens/main/components/WorkspaceView/components/CodeEditor";
import { FileSaveConflictDialog } from "renderer/screens/main/components/WorkspaceView/components/FileSaveConflictDialog";
import { useChangesStore } from "renderer/stores/changes";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { detectLanguage } from "shared/detect-language";
import {
	getStatusColor,
	getStatusIndicator,
} from "../../../RightSidebar/ChangesView/utils";
import { createFileKey, useScrollContext } from "../../context";
import { LightDiffViewer } from "../LightDiffViewer";
import { FileDiffHeader } from "./components/FileDiffHeader";
import { FILE_DIFF_SECTION_PLACEHOLDER_HEIGHT } from "./constants";
import { useFileDiffEdit } from "./hooks/useFileDiffEdit";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

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

const DIFF_LOAD_MARGIN = "150px 0px";
const LARGE_DIFF_THRESHOLD = 500;

const GENERATED_FILE_PATTERNS = [
	/^bun\.lock(b)?$/,
	/^package-lock\.json$/,
	/^yarn\.lock$/,
	/^pnpm-lock\.yaml$/,
	/^composer\.lock$/,
	/^Gemfile\.lock$/,
	/^Cargo\.lock$/,
	/^poetry\.lock$/,
	/^Pipfile\.lock$/,
	/^go\.sum$/,
	/\.min\.(js|css)$/,
	/\.bundle\.(js|css)$/,
	/[\\/]vendor[\\/]/,
	/[\\/]node_modules[\\/]/,
	/[\\/]dist[\\/]/,
	/[\\/]build[\\/]/,
];

function isGeneratedFile(filePath: string): boolean {
	const fileName = filePath.split("/").pop() || filePath;
	return GENERATED_FILE_PATTERNS.some(
		(pattern) => pattern.test(fileName) || pattern.test(filePath),
	);
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
	const { workspaceId } = useParams({ strict: false });
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
	const [hasBeenVisible, setHasBeenVisible] = useState(false);
	const [isInLoadRange, setIsInLoadRange] = useState(false);
	const [loadHiddenDiff, setLoadHiddenDiff] = useState(false);
	const [editedContent, setEditedContent] = useState<string | null>(null);
	const [hasExternalDiskChange, setHasExternalDiskChange] = useState(false);
	const [saveConflict, setSaveConflict] = useState<{
		localContent: string;
		diskContent: string | null;
	} | null>(null);
	const baselineContentRef = useRef("");
	const editedContentRef = useRef<string | null>(null);

	const absolutePath = useMemo(
		() => toAbsoluteWorkspacePath(worktreePath, file.path),
		[worktreePath, file.path],
	);
	const oldAbsolutePath = useMemo(
		() =>
			file.oldPath
				? toAbsoluteWorkspacePath(worktreePath, file.oldPath)
				: undefined,
		[worktreePath, file.oldPath],
	);

	const { isEditing, editable, isSaving, toggleEdit, handleSave } =
		useFileDiffEdit({
			category,
			workspaceId,
			absolutePath,
		});

	const totalChanges = file.additions + file.deletions;
	const isLargeDiff = totalChanges > LARGE_DIFF_THRESHOLD;
	const isGenerated = isGeneratedFile(file.path);
	const isHiddenByDefault = isLargeDiff || isGenerated;

	const fileKey = createFileKey(file, category, commitHash, worktreePath);
	const isViewed = viewedFiles.has(fileKey);

	const openInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();

	const handleOpenInEditor = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (worktreePath) {
				const absolutePath = toAbsoluteWorkspacePath(worktreePath, file.path);
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

	const handleToggleEdit = useCallback(() => {
		if (!toggleEdit) return;
		setActiveFileKey(fileKey);
		toggleEdit();
	}, [fileKey, setActiveFileKey, toggleEdit]);

	useEffect(() => {
		registerFileRef(
			file,
			category,
			commitHash,
			worktreePath,
			sectionRef.current,
		);
		return () => {
			registerFileRef(file, category, commitHash, worktreePath, null);
		};
	}, [file, category, commitHash, registerFileRef, worktreePath]);

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
			([entry]) => {
				setIsInLoadRange(entry.isIntersecting);
				if (entry.isIntersecting) {
					setHasBeenVisible(true);
				}
			},
			{ root: container, rootMargin: DIFF_LOAD_MARGIN },
		);

		activeObserver.observe(element);
		visibilityObserver.observe(element);

		return () => {
			activeObserver.disconnect();
			visibilityObserver.disconnect();
		};
	}, [fileKey, setActiveFileKey, containerRef]);

	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStats = file.additions > 0 || file.deletions > 0;
	const canShowDiffBody =
		isExpanded && (!isHiddenByDefault || loadHiddenDiff) && !!worktreePath;
	const shouldLoadDiff =
		canShowDiffBody && hasBeenVisible && (isInLoadRange || isEditing);

	const isUnstaged = category === "unstaged";

	const { data: gitDiffData, isLoading: isLoadingGitDiff } =
		electronTrpc.changes.getGitFileContents.useQuery(
			{
				worktreePath,
				absolutePath,
				oldAbsolutePath: oldAbsolutePath,
				category:
					(category as "against-base" | "committed" | "staged") ?? "staged",
				commitHash,
				defaultBranch: category === "against-base" ? baseBranch : undefined,
			},
			{
				enabled: !isUnstaged && shouldLoadDiff,
			},
		);

	const { data: gitOriginal, isLoading: isLoadingGitOriginal } =
		electronTrpc.changes.getGitOriginalContent.useQuery(
			{
				worktreePath,
				absolutePath,
				oldAbsolutePath: oldAbsolutePath,
			},
			{
				enabled: isUnstaged && shouldLoadDiff,
			},
		);

	const { data: workingCopy, isLoading: isLoadingWorkingCopy } =
		electronTrpc.filesystem.readFile.useQuery(
			{
				workspaceId: workspaceId ?? "",
				absolutePath,
				encoding: "utf-8",
				maxBytes: MAX_FILE_SIZE,
			},
			{
				enabled: isUnstaged && shouldLoadDiff && !!workspaceId,
			},
		);

	const diffData = useMemo(() => {
		if (!isUnstaged) return gitDiffData;
		if (gitOriginal) {
			let modifiedContent = "";
			if (workingCopy) {
				if (workingCopy.exceededLimit) {
					modifiedContent = `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
				} else {
					modifiedContent = workingCopy.content as string;
				}
			}
			return {
				original: gitOriginal.content,
				modified: modifiedContent,
				language: detectLanguage(file.path),
			};
		}
		return undefined;
	}, [isUnstaged, gitDiffData, gitOriginal, workingCopy, file.path]);

	const isLoadingDiff = isUnstaged
		? isLoadingGitOriginal || isLoadingWorkingCopy
		: isLoadingGitDiff;

	const hasRenderedDiff = canShowDiffBody && !!diffData;
	const modifiedDiffContent = diffData?.modified;

	useEffect(() => {
		editedContentRef.current = editedContent;
	}, [editedContent]);

	useEffect(() => {
		if (!isEditing) {
			setEditedContent(null);
			setHasExternalDiskChange(false);
			setSaveConflict(null);
			baselineContentRef.current = modifiedDiffContent ?? "";
			return;
		}

		if (modifiedDiffContent == null) return;

		const currentEditedContent = editedContentRef.current;
		const isDirty =
			currentEditedContent !== null &&
			currentEditedContent !== baselineContentRef.current;

		if (!isDirty) {
			baselineContentRef.current = modifiedDiffContent;
			setEditedContent(modifiedDiffContent);
			setHasExternalDiskChange(false);
			return;
		}

		if (modifiedDiffContent !== baselineContentRef.current) {
			setHasExternalDiskChange(true);
		}
	}, [isEditing, modifiedDiffContent]);

	const handleSaveEditedContent = useCallback(async () => {
		if (!editable || !isEditing) {
			return;
		}

		const nextContent = editedContentRef.current ?? modifiedDiffContent ?? "";
		const result = await handleSave(nextContent, {
			expectedContent: baselineContentRef.current,
		});

		if (result?.status === "conflict") {
			setSaveConflict({
				localContent: nextContent,
				diskContent: result.currentContent,
			});
			return;
		}

		baselineContentRef.current = nextContent;
		setEditedContent(nextContent);
		setHasExternalDiskChange(false);
	}, [editable, handleSave, isEditing, modifiedDiffContent]);

	const handleReloadFromDisk = useCallback(() => {
		const nextDiskContent =
			saveConflict?.diskContent ??
			diffData?.modified ??
			modifiedDiffContent ??
			"";
		baselineContentRef.current = nextDiskContent;
		setEditedContent(nextDiskContent);
		setHasExternalDiskChange(false);
		setSaveConflict(null);
	}, [diffData?.modified, modifiedDiffContent, saveConflict]);

	const handleOverwriteSave = useCallback(async () => {
		const nextContent = editedContentRef.current ?? modifiedDiffContent ?? "";
		const result = await handleSave(nextContent, { force: true });
		if (result?.status !== "saved") {
			return;
		}

		baselineContentRef.current = nextContent;
		setEditedContent(nextContent);
		setHasExternalDiskChange(false);
		setSaveConflict(null);
	}, [handleSave, modifiedDiffContent]);

	const inactivePlaceholder = (
		<div
			className="flex items-center justify-center text-xs text-muted-foreground bg-background"
			style={{ minHeight: FILE_DIFF_SECTION_PLACEHOLDER_HEIGHT }}
		>
			Diff preview loads when this file is on screen
		</div>
	);

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
					isEditing={isEditing}
					onToggleEdit={handleToggleEdit}
					onStage={onStage}
					onUnstage={onUnstage}
					onDiscard={onDiscard}
					isActioning={isActioning}
				/>

				<CollapsibleContent>
					{isHiddenByDefault && !loadHiddenDiff ? (
						<div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground bg-muted/30">
							<LuFileCode className="w-8 h-8" />
							<p className="text-sm">
								{isGenerated
									? "Generated file hidden"
									: `Large diff hidden — ${totalChanges.toLocaleString()} lines changed`}
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setLoadHiddenDiff(true)}
							>
								Load diff
							</Button>
						</div>
					) : isLoadingDiff ? (
						<div
							className="flex items-center justify-center text-muted-foreground bg-background"
							style={{ minHeight: FILE_DIFF_SECTION_PLACEHOLDER_HEIGHT }}
						>
							<LuLoader className="w-4 h-4 animate-spin mr-2" />
							<span>Loading diff...</span>
						</div>
					) : hasRenderedDiff ? (
						isEditing ? (
							<div className="max-h-[70vh] min-h-[240px] overflow-auto bg-background">
								{hasExternalDiskChange && (
									<div className="border-b px-3 py-2">
										<Alert variant="destructive">
											<AlertTitle>File changed on disk</AlertTitle>
											<AlertDescription>
												This diff editor has local edits. Review the conflict
												before saving or reload the current disk version.
												<div className="mt-2 flex gap-2">
													<Button
														size="sm"
														variant="outline"
														onClick={handleReloadFromDisk}
													>
														Reload From Disk
													</Button>
													<Button
														size="sm"
														onClick={() => {
															setSaveConflict({
																localContent:
																	editedContentRef.current ?? diffData.modified,
																diskContent: diffData.modified,
															});
														}}
													>
														Review Diff
													</Button>
												</div>
											</AlertDescription>
										</Alert>
									</div>
								)}
								<CodeEditor
									key={`${file.path}-edit`}
									value={editedContent ?? diffData.modified}
									language={detectLanguage(file.path)}
									onChange={(value) => {
										setEditedContent(value);
									}}
									onSave={() => {
										void handleSaveEditedContent();
									}}
									fillHeight={false}
								/>
							</div>
						) : (
							<LightDiffViewer
								contents={diffData}
								viewMode={diffViewMode}
								hideUnchangedRegions={hideUnchangedRegions}
								filePath={file.path}
							/>
						)
					) : !shouldLoadDiff ? (
						inactivePlaceholder
					) : (
						<div
							className="flex items-center justify-center text-muted-foreground bg-background"
							style={{ minHeight: FILE_DIFF_SECTION_PLACEHOLDER_HEIGHT }}
						>
							{diffData ? (
								<>
									<LuLoader className="w-4 h-4 animate-spin mr-2" />
									<span>Loading editor...</span>
								</>
							) : (
								"Unable to load diff"
							)}
						</div>
					)}
				</CollapsibleContent>
			</Collapsible>
			<FileSaveConflictDialog
				open={saveConflict !== null}
				onOpenChange={(open) => {
					if (!open) {
						setSaveConflict(null);
					}
				}}
				filePath={file.path}
				localContent={
					saveConflict?.localContent ??
					editedContentRef.current ??
					modifiedDiffContent ??
					""
				}
				diskContent={saveConflict?.diskContent ?? null}
				isSaving={isSaving}
				onKeepEditing={() => setSaveConflict(null)}
				onReloadFromDisk={handleReloadFromDisk}
				onOverwrite={() => {
					void handleOverwriteSave();
				}}
			/>
		</div>
	);
}
