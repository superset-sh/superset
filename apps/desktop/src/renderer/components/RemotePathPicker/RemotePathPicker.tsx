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
import { ScrollArea } from "@superset/ui/scroll-area";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	LuArrowUp,
	LuFolder,
	LuFolderOpen,
	LuHouse,
	LuRefreshCw,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface RemotePathPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hostUrl: string | null;
	hostName: string;
	/** Initial directory shown when the picker opens. Defaults to `~`. */
	initialPath?: string | null;
	onPick: (absolutePath: string) => void;
	title?: string;
	description?: string;
	confirmLabel?: string;
}

interface BrowseResult {
	path: string;
	parentPath: string | null;
	homePath: string;
	entries: { name: string; isDirectory: boolean; isSymlink: boolean }[];
}

export function RemotePathPicker({
	open,
	onOpenChange,
	hostUrl,
	hostName,
	initialPath,
	onPick,
	title = "Choose a folder",
	description,
	confirmLabel = "Use this folder",
}: RemotePathPickerProps) {
	const [currentPath, setCurrentPath] = useState<string | null>(
		initialPath ?? null,
	);
	const [pathDraft, setPathDraft] = useState<string>(initialPath ?? "");

	useEffect(() => {
		if (open) {
			setCurrentPath(initialPath ?? null);
			setPathDraft(initialPath ?? "");
		}
	}, [open, initialPath]);

	const query = useQuery<BrowseResult>({
		enabled: open && !!hostUrl,
		queryKey: ["remote-path-picker", hostUrl, currentPath],
		queryFn: async () => {
			if (!hostUrl) throw new Error("Host unavailable");
			const client = getHostServiceClientByUrl(hostUrl);
			return await client.filesystem.browseHost.query({
				path: currentPath ?? undefined,
			});
		},
	});

	useEffect(() => {
		if (query.data) {
			setCurrentPath(query.data.path);
			setPathDraft(query.data.path);
		}
	}, [query.data]);

	useEffect(() => {
		if (query.error) {
			toast.error(
				query.error instanceof Error
					? query.error.message
					: "Could not list directory",
			);
		}
	}, [query.error]);

	const goTo = (path: string) => {
		setCurrentPath(path);
	};

	const goUp = () => {
		if (query.data?.parentPath) goTo(query.data.parentPath);
	};

	const goHome = () => {
		if (query.data?.homePath) goTo(query.data.homePath);
		else setCurrentPath(null);
	};

	const submitPathDraft = () => {
		const trimmed = pathDraft.trim();
		if (!trimmed) return;
		setCurrentPath(trimmed);
	};

	const handlePick = () => {
		const target = query.data?.path ?? currentPath;
		if (!target) return;
		onPick(target);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[560px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{description ?? `Browse folders on ${hostName}.`}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={goUp}
							disabled={!query.data?.parentPath || query.isFetching}
							aria-label="Up one folder"
							className="shrink-0"
						>
							<LuArrowUp className="size-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={goHome}
							disabled={query.isFetching}
							aria-label="Home folder"
							className="shrink-0"
						>
							<LuHouse className="size-4" />
						</Button>
						<Input
							value={pathDraft}
							onChange={(e) => setPathDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									submitPathDraft();
								}
							}}
							onBlur={submitPathDraft}
							placeholder={`Path on ${hostName} (~ for home)`}
							className="flex-1 font-mono text-sm"
							spellCheck={false}
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={() => query.refetch()}
							disabled={query.isFetching}
							aria-label="Refresh"
							className="shrink-0"
						>
							<LuRefreshCw
								className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
							/>
						</Button>
					</div>

					<ScrollArea className="h-64 rounded-md border">
						{query.isLoading ? (
							<div className="flex flex-col gap-1 p-2">
								{[0, 1, 2, 3, 4].map((i) => (
									<Skeleton key={i} className="h-7 w-full" />
								))}
							</div>
						) : query.data ? (
							query.data.entries.filter((e) => e.isDirectory).length === 0 ? (
								<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
									{query.data.entries.length === 0
										? "Empty folder"
										: "No subfolders"}
								</div>
							) : (
								<ul className="flex flex-col">
									{query.data.entries
										.filter((entry) => entry.isDirectory)
										.map((entry) => {
											const childPath = `${query.data.path.replace(/\/$/, "")}/${entry.name}`;
											return (
												<li key={entry.name}>
													<button
														type="button"
														onDoubleClick={() => goTo(childPath)}
														onClick={() => setPathDraft(childPath)}
														className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
													>
														<LuFolder className="size-4 shrink-0 text-muted-foreground" />
														<span className="truncate">{entry.name}</span>
														{entry.isSymlink && (
															<span className="ml-auto text-xs text-muted-foreground">
																link
															</span>
														)}
													</button>
												</li>
											);
										})}
								</ul>
							)
						) : (
							<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
								No data
							</div>
						)}
					</ScrollArea>
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
						type="button"
						onClick={handlePick}
						disabled={!query.data || query.isFetching}
					>
						<LuFolderOpen className="size-4" />
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
