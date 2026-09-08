import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { V2ScriptsEditor } from "../V2ScriptsEditor";

export function WorkspaceSetupSection({
	hostUrl,
	projectId,
}: {
	hostUrl: string;
	projectId: string;
}) {
	const { t } = useLingui();
	const client = getHostServiceClientByUrl(hostUrl);
	const query = useQuery({
		queryKey: ["workspace-setup-project", hostUrl, projectId],
		queryFn: () => client.workspaceSetup.getProject.query({ projectId }),
	});
	const [path, setPath] = useState("");
	const update = useMutation({
		mutationFn: (input: {
			defaultBaseRef?: string | null;
			sharedFilePaths?: string[];
		}) => client.workspaceSetup.updateProject.mutate({ projectId, ...input }),
		onSuccess: () => query.refetch(),
	});
	const data = query.data;
	if (query.isPending)
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>Loading…</Trans>
			</p>
		);
	if (!data)
		return (
			<p role="alert" className="text-sm text-destructive">
				{query.error?.message}
			</p>
		);
	const paths = [...new Set([...data.sharedFilePaths, ...data.candidates])];
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Label htmlFor="workspace-default-base">
					<Trans>Default base branch</Trans>
				</Label>
				<select
					id="workspace-default-base"
					className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
					value={data.defaultBaseRef ?? ""}
					disabled={update.isPending}
					onChange={(event) =>
						update.mutate({ defaultBaseRef: event.target.value || null })
					}
				>
					<option value="">{t({ message: "Repository default" })}</option>
					{[
						...new Set([
							...(data.defaultBaseRef ? [data.defaultBaseRef] : []),
							...data.refs,
						]),
					].map((ref) => (
						<option key={ref} value={ref}>
							{ref.startsWith("refs/heads/")
								? `${ref.slice(11)} · ${t({ message: "Local" })}`
								: ref.replace("refs/remotes/", "")}
						</option>
					))}
				</select>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Remote branches are refreshed before each new workspace. Local
						branches use the commit on this host.
					</Trans>
				</p>
			</div>
			<V2ScriptsEditor hostUrl={hostUrl} projectId={projectId} />
			<div className="space-y-3">
				<div>
					<Label htmlFor="shared-file-path">
						<Trans>Shared files</Trans>
					</Label>
					<p className="mt-1 text-xs text-muted-foreground">
						<Trans>
							Selected files link to the root checkout. Edits are shared across
							workspaces.
						</Trans>
					</p>
				</div>
				{paths.map((file) => (
					<label key={file} className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={data.sharedFilePaths.includes(file)}
							disabled={update.isPending}
							onChange={(event) =>
								update.mutate({
									sharedFilePaths: event.target.checked
										? [...data.sharedFilePaths, file]
										: data.sharedFilePaths.filter((item) => item !== file),
								})
							}
						/>
						<span className="font-mono break-all">{file}</span>
					</label>
				))}
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						if (path.trim())
							update.mutate(
								{ sharedFilePaths: [...data.sharedFilePaths, path.trim()] },
								{ onSuccess: () => setPath("") },
							);
					}}
				>
					<Input
						id="shared-file-path"
						value={path}
						onChange={(event) => setPath(event.target.value)}
						placeholder="apps/web/.env.local"
					/>
					<Button
						type="submit"
						variant="outline"
						disabled={!path.trim() || update.isPending}
					>
						<Trans>Add file</Trans>
					</Button>
				</form>
				<p className="text-xs text-muted-foreground">
					<Trans>Only ignored files on this host can be shared.</Trans>
				</p>
			</div>
			{update.error && (
				<p role="alert" className="text-sm text-destructive">
					{update.error.message}
				</p>
			)}
		</div>
	);
}
