import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useCallback, useEffect, useState } from "react";
import { LuCheck, LuRotateCcw } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SshConfig {
	host: string;
	port: number;
	user: string;
	workDir: string;
	identityFile?: string;
	containerName?: string;
}

interface SshConfigPanelProps {
	workspaceId: string;
	sshConfig: SshConfig;
}

export function SshConfigPanel({
	workspaceId,
	sshConfig,
}: SshConfigPanelProps) {
	const [host, setHost] = useState(sshConfig.host);
	const [port, setPort] = useState(sshConfig.port);
	const [user, setUser] = useState(sshConfig.user);
	const [workDir, setWorkDir] = useState(sshConfig.workDir);
	const [identityFile, setIdentityFile] = useState(
		sshConfig.identityFile ?? "",
	);
	const [containerName, setContainerName] = useState(
		sshConfig.containerName ?? "",
	);

	useEffect(() => {
		setHost(sshConfig.host);
		setPort(sshConfig.port);
		setUser(sshConfig.user);
		setWorkDir(sshConfig.workDir);
		setIdentityFile(sshConfig.identityFile ?? "");
		setContainerName(sshConfig.containerName ?? "");
	}, [sshConfig]);

	const trpcUtils = electronTrpc.useUtils();
	const updateMutation = electronTrpc.workspaces.updateSshConfig.useMutation({
		onSuccess: () => {
			trpcUtils.workspaces.getWorktreeInfo.invalidate({ workspaceId });
		},
	});

	const hasChanges =
		host !== sshConfig.host ||
		port !== sshConfig.port ||
		user !== sshConfig.user ||
		workDir !== sshConfig.workDir ||
		identityFile !== (sshConfig.identityFile ?? "") ||
		containerName !== (sshConfig.containerName ?? "");

	const handleSave = useCallback(() => {
		updateMutation.mutate({
			id: workspaceId,
			sshConfig: {
				host,
				port,
				user,
				workDir,
				...(identityFile ? { identityFile } : {}),
				...(containerName ? { containerName } : {}),
			},
		});
	}, [
		workspaceId,
		host,
		port,
		user,
		workDir,
		identityFile,
		containerName,
		updateMutation,
	]);

	const handleReset = useCallback(() => {
		setHost(sshConfig.host);
		setPort(sshConfig.port);
		setUser(sshConfig.user);
		setWorkDir(sshConfig.workDir);
		setIdentityFile(sshConfig.identityFile ?? "");
		setContainerName(sshConfig.containerName ?? "");
	}, [sshConfig]);

	return (
		<div className="flex flex-col gap-4 p-3 overflow-y-auto">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ssh-host" className="text-xs text-muted-foreground">
					Host
				</Label>
				<Input
					id="ssh-host"
					value={host}
					onChange={(e) => setHost(e.target.value)}
					className="h-7 text-xs"
					placeholder="hostname or IP"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ssh-port" className="text-xs text-muted-foreground">
					Port
				</Label>
				<Input
					id="ssh-port"
					type="number"
					value={port}
					onChange={(e) => setPort(Number(e.target.value))}
					className="h-7 text-xs"
					placeholder="22"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ssh-user" className="text-xs text-muted-foreground">
					User
				</Label>
				<Input
					id="ssh-user"
					value={user}
					onChange={(e) => setUser(e.target.value)}
					className="h-7 text-xs"
					placeholder="root"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ssh-workdir" className="text-xs text-muted-foreground">
					Working Directory
				</Label>
				<Input
					id="ssh-workdir"
					value={workDir}
					onChange={(e) => setWorkDir(e.target.value)}
					className="h-7 text-xs"
					placeholder="/home/user/project"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ssh-identity" className="text-xs text-muted-foreground">
					Identity File
				</Label>
				<Input
					id="ssh-identity"
					value={identityFile}
					onChange={(e) => setIdentityFile(e.target.value)}
					className="h-7 text-xs"
					placeholder="~/.ssh/id_rsa (optional)"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label
					htmlFor="ssh-container"
					className="text-xs text-muted-foreground"
				>
					Container Name
				</Label>
				<Input
					id="ssh-container"
					value={containerName}
					onChange={(e) => setContainerName(e.target.value)}
					className="h-7 text-xs"
					placeholder="my-container (optional)"
				/>
			</div>

			{hasChanges && (
				<div className="flex items-center gap-2 pt-1">
					<Button
						size="sm"
						variant="default"
						className="h-7 text-xs flex-1"
						onClick={handleSave}
						disabled={updateMutation.isPending || !host || !user || !workDir}
					>
						<LuCheck className="size-3 mr-1" />
						{updateMutation.isPending ? "Saving..." : "Save"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 text-xs"
						onClick={handleReset}
					>
						<LuRotateCcw className="size-3" />
					</Button>
				</div>
			)}
		</div>
	);
}
