import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuKeyRound,
} from "react-icons/lu";

interface EnvSyncSectionProps {
	data:
		| {
				files: {
					name: string;
					relativePath: string;
					exists: boolean;
					hash: string | null;
					lastModified: string | null;
					keyCount: number;
				}[];
				inSync: boolean;
				staleFiles: string[];
		  }
		| undefined;
	isLoading: boolean;
	onSync: () => void;
}

function formatRelativeTime(dateStr: string | null): string {
	if (!dateStr) return "unknown";
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDays = Math.floor(diffHr / 24);
	return `${diffDays}d ago`;
}

export function EnvSyncSection({
	data,
	isLoading,
	onSync,
}: EnvSyncSectionProps) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuKeyRound className="size-3 shrink-0" />
				<span>Env Status</span>
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-sm">
					{isLoading ? (
						<p className="text-muted-foreground">Loading...</p>
					) : !data ? (
						<p className="text-muted-foreground">No env data available</p>
					) : data.inSync ? (
						<div className="flex items-center gap-1.5 text-green-500">
							<LuCheck className="size-3 shrink-0" />
							<span>All in sync</span>
							<span className="text-muted-foreground">
								({data.files.length} files)
							</span>
						</div>
					) : (
						<div className="space-y-1.5">
							{data.files.map((file) => {
								const isStale = data.staleFiles.includes(file.name);
								return (
									<div
										key={file.relativePath}
										className="flex items-center gap-2"
									>
										<div
											className={cn(
												"size-2 rounded-full shrink-0",
												!file.exists
													? "bg-red-500"
													: isStale
														? "bg-orange-400"
														: "bg-green-500",
											)}
										/>
										<span className="truncate">{file.name}</span>
										<span className="text-muted-foreground text-xs shrink-0">
											{file.keyCount} keys
										</span>
										{file.hash && (
											<span className="font-mono text-muted-foreground text-xs shrink-0">
												{file.hash.slice(0, 6)}
											</span>
										)}
										<span className="text-muted-foreground text-xs shrink-0 ml-auto">
											{formatRelativeTime(file.lastModified)}
										</span>
										{isStale && (
											<span className="text-xs text-orange-400 bg-orange-400/10 rounded px-1 shrink-0">
												stale
											</span>
										)}
									</div>
								);
							})}

							<Button
								variant="outline"
								size="sm"
								onClick={onSync}
								className="mt-2 gap-1.5"
							>
								Sync All
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
