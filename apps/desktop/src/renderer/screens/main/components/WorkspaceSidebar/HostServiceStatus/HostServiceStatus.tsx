import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

type HealthStatus = "unknown" | "ok" | "error";

interface ServiceInfo {
	platform: string;
	arch: string;
	nodeVersion: string;
	uptime: number;
}

// TODO: Remove this test UI once real git views (diff viewer, changes panel) are implemented
type GitStatusResult = Awaited<
	ReturnType<HostServiceClient["git"]["status"]["query"]>
>;

export function HostServiceStatus() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD);
	const { services } = useHostService();
	const { data: session } = authClient.useSession();

	const activeOrgId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);

	const service = activeOrgId ? services.get(activeOrgId) : null;

	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<HealthStatus>("unknown");
	const [info, setInfo] = useState<ServiceInfo | null>(null);
	const [repoPath, setRepoPath] = useState("");
	const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const checkHealth = useCallback(async () => {
		if (!service) {
			setStatus("unknown");
			return;
		}
		try {
			const result = await service.client.health.check.query();
			setStatus(result.status === "ok" ? "ok" : "error");
		} catch {
			setStatus("error");
		}
	}, [service]);

	const fetchInfo = useCallback(async () => {
		if (!service) return;
		try {
			const result = await service.client.health.info.query();
			setInfo(result);
		} catch {
			setInfo(null);
		}
	}, [service]);

	useEffect(() => {
		checkHealth();
		const interval = setInterval(checkHealth, 15_000);
		return () => clearInterval(interval);
	}, [checkHealth]);

	const fetchGitStatus = useCallback(async () => {
		if (!service || !repoPath.trim()) {
			setError("Enter a repository path");
			return;
		}
		setLoading(true);
		setError(null);
		setGitStatus(null);
		try {
			const data = await service.client.git.status.query({
				path: repoPath,
			});
			setGitStatus(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Query failed");
		} finally {
			setLoading(false);
		}
	}, [service, repoPath]);

	if (!enabled) return null;

	const dotColor =
		status === "ok"
			? "bg-green-500"
			: status === "error"
				? "bg-red-500"
				: "bg-yellow-500";

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="size-6"
				onClick={() => {
					fetchInfo();
					setOpen(true);
				}}
			>
				<span className={`size-2 rounded-full ${dotColor}`} />
			</Button>

			<Dialog open={open} onOpenChange={setOpen} modal>
				<DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							Host Service
							<Badge
								variant={
									status === "ok"
										? "default"
										: status === "error"
											? "destructive"
											: "secondary"
								}
							>
								{status}
							</Badge>
						</DialogTitle>
					</DialogHeader>

					{/* Service Info */}
					<div className="flex gap-4 text-xs text-muted-foreground border-b border-border pb-3">
						{service && <span>{service.url}</span>}
						{info && (
							<>
								<span>
									{info.platform} ({info.arch})
								</span>
								<span>Node {info.nodeVersion}</span>
								<span>Uptime: {Math.floor(info.uptime)}s</span>
							</>
						)}
					</div>

					{/* Git Operations */}
					<div className="space-y-3 flex-1 min-h-0 flex flex-col">
						<div className="flex gap-2">
							<input
								type="text"
								value={repoPath}
								onChange={(e) => setRepoPath(e.target.value)}
								placeholder="Repository path (e.g. /Users/you/project)"
								className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={loading || !service}
								onClick={fetchGitStatus}
							>
								Git Status
							</Button>
						</div>

						{error && (
							<div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
								{error}
							</div>
						)}

						{loading && (
							<div className="text-sm text-muted-foreground">Loading...</div>
						)}

						{gitStatus && (
							<ScrollArea className="flex-1 min-h-0 rounded-md border border-border">
								<div className="p-3">
									<GitStatusView data={gitStatus} />
								</div>
							</ScrollArea>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

function GitStatusView({ data }: { data: GitStatusResult }) {
	return (
		<div className="space-y-2 text-sm">
			<div className="font-medium">
				Branch: {data.current}
				{data.tracking && (
					<span className="text-muted-foreground"> → {data.tracking}</span>
				)}
			</div>
			{(data.ahead > 0 || data.behind > 0) && (
				<div className="text-muted-foreground">
					{data.ahead > 0 && `↑${data.ahead} `}
					{data.behind > 0 && `↓${data.behind}`}
				</div>
			)}
			{data.isClean ? (
				<div className="text-green-500">Working tree clean</div>
			) : (
				<div className="space-y-1">
					<FileList label="Staged" files={data.staged} color="text-green-500" />
					<FileList
						label="Modified"
						files={data.modified}
						color="text-yellow-500"
					/>
					<FileList
						label="Untracked"
						files={data.not_added}
						color="text-muted-foreground"
					/>
					<FileList label="Deleted" files={data.deleted} color="text-red-500" />
					<FileList
						label="Conflicted"
						files={data.conflicted}
						color="text-red-500"
					/>
				</div>
			)}
		</div>
	);
}

function FileList({
	label,
	files,
	color,
}: {
	label: string;
	files: string[];
	color: string;
}) {
	if (files.length === 0) return null;
	return (
		<div>
			<div className="font-medium text-xs uppercase tracking-wider text-muted-foreground">
				{label} ({files.length})
			</div>
			{files.map((f) => (
				<div key={f} className={`font-mono text-xs ${color}`}>
					{f}
				</div>
			))}
		</div>
	);
}
