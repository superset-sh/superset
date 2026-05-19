import {
	Breadcrumb,
	BreadcrumbEllipsis,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ScrollArea } from "@superset/ui/scroll-area";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useState } from "react";
import {
	LuExternalLink,
	LuFolder,
	LuFolderOpen,
	LuRefreshCw,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface RemotePathPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	hostUrl: string | null;
	hostName: string;
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

interface Segment {
	label: string;
	path: string;
}

const MAX_VISIBLE_SEGMENTS = 4;

function pathToSegments(path: string, homePath: string | null): Segment[] {
	const segments: Segment[] = [];
	if (homePath && (path === homePath || path === `${homePath}/`)) {
		return [{ label: "Home", path: homePath }];
	}
	if (homePath && path.startsWith(`${homePath}/`)) {
		segments.push({ label: "Home", path: homePath });
		const rest = path.slice(homePath.length + 1);
		let cumulative = homePath;
		for (const part of rest.split("/").filter(Boolean)) {
			cumulative = `${cumulative}/${part}`;
			segments.push({ label: part, path: cumulative });
		}
		return segments;
	}
	segments.push({ label: "/", path: "/" });
	let cumulative = "";
	for (const part of path.split("/").filter(Boolean)) {
		cumulative = `${cumulative}/${part}`;
		segments.push({ label: part, path: cumulative });
	}
	return segments;
}

function joinPath(base: string, child: string): string {
	return `${base.replace(/\/$/, "")}/${child}`;
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

	useEffect(() => {
		if (open) {
			setCurrentPath(initialPath ?? null);
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
		if (query.data) setCurrentPath(query.data.path);
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

	const allSegments = query.data
		? pathToSegments(query.data.path, query.data.homePath)
		: [];

	const segments: (Segment | "ellipsis")[] =
		allSegments.length > MAX_VISIBLE_SEGMENTS
			? [
					allSegments[0],
					"ellipsis",
					...allSegments.slice(-(MAX_VISIBLE_SEGMENTS - 1)),
				]
			: allSegments;

	const folders = query.data?.entries.filter((e) => e.isDirectory) ?? [];

	const handlePick = () => {
		if (!query.data) return;
		onPick(query.data.path);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="max-w-[560px] gap-0 p-0">
				<DialogHeader className="px-5 pt-5 pb-3">
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{description ?? `Browse folders on ${hostName}.`}
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center gap-2 border-y border-border px-5 py-2">
					<div className="min-w-0 flex-1">
						{query.data ? (
							<Breadcrumb>
								<BreadcrumbList className="flex-nowrap">
									{segments.map((seg, i) => {
										const isLast = i === segments.length - 1;
										if (seg === "ellipsis") {
											return (
												<Fragment key="ellipsis">
													<BreadcrumbItem>
														<BreadcrumbEllipsis />
													</BreadcrumbItem>
													<BreadcrumbSeparator />
												</Fragment>
											);
										}
										return (
											<Fragment key={seg.path}>
												<BreadcrumbItem className="min-w-0">
													{isLast ? (
														<BreadcrumbPage className="truncate">
															{seg.label}
														</BreadcrumbPage>
													) : (
														<BreadcrumbLink asChild>
															<button
																type="button"
																onClick={() => setCurrentPath(seg.path)}
																className="truncate hover:text-foreground"
															>
																{seg.label}
															</button>
														</BreadcrumbLink>
													)}
												</BreadcrumbItem>
												{!isLast && <BreadcrumbSeparator />}
											</Fragment>
										);
									})}
								</BreadcrumbList>
							</Breadcrumb>
						) : (
							<Skeleton className="h-4 w-40" />
						)}
					</div>
					<button
						type="button"
						onClick={() => query.refetch()}
						disabled={query.isFetching}
						aria-label="Refresh"
						className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
					>
						<LuRefreshCw
							className={cn("size-3.5", query.isFetching && "animate-spin")}
						/>
					</button>
				</div>

				<ScrollArea className="h-72">
					{query.isLoading ? (
						<div className="flex flex-col gap-0.5 p-2">
							{[0, 1, 2, 3, 4].map((i) => (
								<div key={i} className="flex items-center gap-2 px-2 py-1.5">
									<Skeleton className="size-4 shrink-0 rounded-sm" />
									<Skeleton className="h-4 w-40" />
								</div>
							))}
						</div>
					) : folders.length === 0 ? (
						<div className="flex h-72 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
							<LuFolder className="size-6 opacity-40" />
							<span>
								{query.data?.entries.length === 0
									? "Empty folder"
									: "No subfolders"}
							</span>
						</div>
					) : (
						<ul className="flex flex-col gap-0.5 p-2">
							{folders.map((entry) => {
								const childPath = query.data
									? joinPath(query.data.path, entry.name)
									: entry.name;
								return (
									<li key={entry.name}>
										<button
											type="button"
											onClick={() => setCurrentPath(childPath)}
											className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
										>
											<LuFolder className="size-4 shrink-0 text-muted-foreground" />
											<span className="truncate">{entry.name}</span>
											{entry.isSymlink && (
												<LuExternalLink className="ml-auto size-3 shrink-0 text-muted-foreground/60" />
											)}
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</ScrollArea>

				<DialogFooter className="border-t border-border px-5 py-3">
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
