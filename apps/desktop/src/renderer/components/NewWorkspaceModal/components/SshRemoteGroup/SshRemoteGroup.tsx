import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateRemoteWorkspace } from "renderer/react-query/workspaces";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";

interface SshRemoteGroupProps {
	projectId: string | null;
}

export function SshRemoteGroup({ projectId }: SshRemoteGroupProps) {
	const { draft, updateDraft, runAsyncAction } = useNewWorkspaceModalDraft();
	const { sshHostId, remotePath, prompt } = draft;

	const [password, setPassword] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const { data: sshHosts = [], isLoading: isHostsLoading } =
		electronTrpc.sshHosts.list.useQuery();

	const connectMutation = electronTrpc.sshHosts.connect.useMutation({
		onSuccess: () => {
			setIsConnected(true);
			setPassword("");
		},
		onError: () => {
			setIsConnected(false);
		},
	});

	const createRemoteWorkspace = useCreateRemoteWorkspace();

	const selectedHost = sshHosts.find((host) => host.id === sshHostId);

	const handleHostChange = (value: string) => {
		if (value === "__add_new__") {
			return;
		}
		setIsConnected(false);
		updateDraft({ sshHostId: value, remotePath: "" });
	};

	const handleConnect = () => {
		if (!sshHostId) return;
		setIsConnecting(true);
		void connectMutation
			.mutateAsync({ id: sshHostId, password: password || undefined })
			.finally(() => {
				setIsConnecting(false);
			});
	};

	const handleCreate = () => {
		if (!sshHostId || !remotePath.trim() || !projectId) return;
		void runAsyncAction(
			createRemoteWorkspace.mutateAsync({
				projectId,
				sshHostId,
				remotePath: remotePath.trim(),
				prompt: prompt.trim() || undefined,
			}),
			{
				loading: "Creating remote workspace...",
				success: "Remote workspace created",
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
	};

	return (
		<div className="p-3 space-y-3">
			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">SSH Host</Label>
				<Select
					value={sshHostId ?? ""}
					onValueChange={handleHostChange}
					disabled={isHostsLoading}
				>
					<SelectTrigger className="h-8 text-xs w-full">
						<SelectValue
							placeholder={
								isHostsLoading ? "Loading hosts..." : "Select an SSH host"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{sshHosts.map((host) => (
							<SelectItem key={host.id} value={host.id}>
								<span className="flex items-center gap-2">
									<span className="size-2 rounded-full shrink-0 bg-muted-foreground" />
									<span>{host.label ?? host.hostname}</span>
									{host.label && (
										<span className="text-muted-foreground text-xs">
											{host.hostname}
										</span>
									)}
								</span>
							</SelectItem>
						))}
						<SelectItem value="__add_new__" disabled>
							Add new host...
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{sshHostId && (
				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">Connection</Label>
					{isConnected ? (
						<Badge
							variant="outline"
							className="text-green-600 border-green-600/30 bg-green-500/10"
						>
							<span className="size-1.5 rounded-full bg-green-500 mr-1.5" />
							Connected
						</Badge>
					) : (
						<div className="space-y-2">
							<Input
								type="password"
								className="h-8 text-xs"
								placeholder="Password or passphrase (if required)"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleConnect();
								}}
							/>
							<Button
								size="sm"
								variant="outline"
								className="h-8 text-xs w-full"
								onClick={handleConnect}
								disabled={isConnecting || connectMutation.isPending}
							>
								{isConnecting || connectMutation.isPending
									? "Connecting..."
									: "Connect"}
							</Button>
						</div>
					)}
				</div>
			)}

			{isConnected && (
				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">Remote Path</Label>
					<Input
						className="h-8 text-xs font-mono"
						placeholder={
							selectedHost?.defaultDirectory ?? "/home/user/projects/my-project"
						}
						value={remotePath}
						onChange={(e) => updateDraft({ remotePath: e.target.value })}
					/>
				</div>
			)}

			{isConnected && (
				<div className="space-y-1.5">
					<Label className="text-xs text-muted-foreground">
						Prompt (optional)
					</Label>
					<Textarea
						className="min-h-24 max-h-48 text-sm resize-y field-sizing-fixed"
						placeholder="What do you want to do?"
						value={prompt}
						onChange={(e) => updateDraft({ prompt: e.target.value })}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleCreate();
							}
						}}
					/>
				</div>
			)}

			{isConnected && (
				<Button
					className="w-full h-8 text-sm"
					onClick={handleCreate}
					disabled={!remotePath.trim() || createRemoteWorkspace.isPending}
				>
					Create Remote Workspace
				</Button>
			)}
		</div>
	);
}
