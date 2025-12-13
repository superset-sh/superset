import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useCallback, useState } from "react";
import { HiChevronRight, HiFolder, HiFolderOpen } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";

interface DirectoryNavigatorProps {
	paneId: string;
	currentCwd?: string | null;
	cwdConfirmed?: boolean;
}

export function DirectoryNavigator({
	paneId,
	currentCwd,
	cwdConfirmed,
}: DirectoryNavigatorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [browsePath, setBrowsePath] = useState<string | null>(null);

	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const writeMutation = trpc.terminal.write.useMutation();

	// Navigation enabled when we have any cwd (seeded or confirmed)
	const hasCwd = !!currentCwd;
	const displayPath = browsePath || currentCwd;

	const { data: directoryData, isLoading } =
		trpc.terminal.listDirectory.useQuery(
			{ dirPath: displayPath || "/" },
			{ enabled: isOpen && hasCwd && !!displayPath },
		);

	const handleOpen = useCallback(
		(open: boolean) => {
			if (!hasCwd) return;
			setIsOpen(open);
			if (!open) {
				setBrowsePath(null);
			}
		},
		[hasCwd],
	);

	const handleNavigateToDir = useCallback(
		(path: string) => {
			writeMutation.mutate({
				paneId,
				data: `cd ${shellEscape(path)}\n`,
			});
			setIsOpen(false);
			setBrowsePath(null);
		},
		[paneId, writeMutation],
	);

	const handleBrowseDir = useCallback((path: string) => {
		setBrowsePath(path);
	}, []);

	const handleNavigateUp = useCallback(() => {
		if (directoryData?.parentPath) {
			setBrowsePath(directoryData.parentPath);
		}
	}, [directoryData?.parentPath]);

	const getBasename = (path: string) => {
		const segments = path.split("/").filter(Boolean);
		return segments[segments.length - 1] || "/";
	};

	const getPathSegments = (path: string) => {
		// Normalize homeDir by removing any trailing slash
		const normalizedHomeDir = homeDir?.replace(/\/$/, "");
		// Path is in home only if it equals homeDir or starts with homeDir + "/"
		const isInHome =
			normalizedHomeDir &&
			(path === normalizedHomeDir || path.startsWith(`${normalizedHomeDir}/`));

		if (isInHome && normalizedHomeDir) {
			// If path equals homeDir, relativePath is empty; otherwise slice after the "/"
			const relativePath =
				path === normalizedHomeDir
					? ""
					: path.slice(normalizedHomeDir.length + 1);
			const segments = relativePath.split("/").filter(Boolean);
			return [
				{ name: "~", path: normalizedHomeDir },
				...segments.map((seg, idx) => ({
					name: seg,
					path: `${normalizedHomeDir}/${segments.slice(0, idx + 1).join("/")}`,
				})),
			];
		}

		const segments = path.split("/").filter(Boolean);
		return [
			{ name: "/", path: "/" },
			...segments.map((seg, idx) => ({
				name: seg,
				path: `/${segments.slice(0, idx + 1).join("/")}`,
			})),
		];
	};

	// Show directory name only if confirmed by OSC-7, otherwise show "Terminal"
	const buttonLabel =
		cwdConfirmed && currentCwd ? getBasename(currentCwd) : "Terminal";

	// When no cwd at all, show non-interactive display
	if (!hasCwd) {
		return (
			<div className="flex min-w-0 items-center gap-1.5 px-1 -ml-1">
				<HiFolder className="size-3.5 shrink-0 text-muted-foreground/70" />
				<span className="truncate text-sm text-muted-foreground">Terminal</span>
			</div>
		);
	}

	const pathSegments = displayPath ? getPathSegments(displayPath) : [];
	const directories =
		directoryData?.items?.filter((item) => item.isDirectory) || [];

	return (
		<Popover open={isOpen} onOpenChange={handleOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex min-w-0 items-center gap-1.5 rounded px-1 -ml-1 hover:bg-accent/50 transition-colors"
				>
					<HiFolder className="size-3.5 shrink-0 text-muted-foreground/70" />
					<span
						className={`truncate text-sm ${!cwdConfirmed ? "text-muted-foreground" : ""}`}
					>
						{buttonLabel}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-72 p-0"
				onOpenAutoFocus={(e: Event) => e.preventDefault()}
			>
				{/* Breadcrumb navigation */}
				<div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5 overflow-x-auto hide-scrollbar">
					{pathSegments.map((segment, idx) => (
						<div key={segment.path} className="flex items-center shrink-0">
							{idx > 0 && (
								<HiChevronRight className="size-3 text-muted-foreground/50 mx-0.5" />
							)}
							<button
								type="button"
								onClick={() => handleBrowseDir(segment.path)}
								className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-accent/50"
							>
								{segment.name}
							</button>
						</div>
					))}
				</div>

				{/* Directory list */}
				<div className="max-h-64 overflow-y-auto">
					{/* Parent directory */}
					{directoryData?.parentPath && (
						<button
							type="button"
							onClick={handleNavigateUp}
							className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
						>
							<HiFolderOpen className="size-4 text-muted-foreground" />
							<span className="text-muted-foreground">..</span>
						</button>
					)}

					{isLoading ? (
						<div className="px-2 py-3 text-sm text-muted-foreground text-center">
							Loading...
						</div>
					) : directories.length === 0 ? (
						<div className="px-2 py-3 text-sm text-muted-foreground text-center">
							No subdirectories
						</div>
					) : (
						directories.map((item) => (
							<div key={item.path} className="flex items-center group">
								<button
									type="button"
									onClick={() => handleBrowseDir(item.path)}
									className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
								>
									<HiFolder className="size-4 shrink-0 text-muted-foreground" />
									<span className="truncate">{item.name}</span>
								</button>
								<button
									type="button"
									onClick={() => handleNavigateToDir(item.path)}
									className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
									title="Navigate here"
								>
									cd
								</button>
							</div>
						))
					)}
				</div>

				{/* Navigate to current browse path */}
				{browsePath && browsePath !== currentCwd && (
					<div className="border-t border-border p-2">
						<button
							type="button"
							onClick={() => handleNavigateToDir(browsePath)}
							className="w-full rounded bg-primary/10 px-2 py-1.5 text-sm text-primary hover:bg-primary/20 transition-colors"
						>
							Navigate here
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

/**
 * Escape a path for safe use in shell commands
 */
function shellEscape(path: string): string {
	if (/[^a-zA-Z0-9._\-/~]/.test(path)) {
		return `'${path.replace(/'/g, "'\\''")}'`;
	}
	return path;
}
