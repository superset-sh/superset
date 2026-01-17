import { useState } from "react";
import { HiOutlineServer, HiOutlineCog6Tooth } from "react-icons/hi2";
import { Link } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface OpenRemoteDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onError: (error: string) => void;
}

export function OpenRemoteDialog({
	isOpen,
	onClose,
	onError,
}: OpenRemoteDialogProps) {
	const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
	const [remotePath, setRemotePath] = useState("");
	const [projectName, setProjectName] = useState("");

	const utils = electronTrpc.useUtils();
	const { data: connections = [], isLoading: loadingConnections } =
		electronTrpc.ssh.listConnections.useQuery();

	const createRemoteProject = electronTrpc.ssh.createRemoteProject.useMutation({
		onSuccess: (project) => {
			// Create a workspace for the project
			createRemoteWorkspace.mutate({
				remoteProjectId: project.id,
				branch: "main",
				name: "main",
			});
		},
		onError: (err) => {
			onError(err.message || "Failed to create remote project");
		},
	});

	const createRemoteWorkspace =
		electronTrpc.ssh.createRemoteWorkspace.useMutation({
			onSuccess: () => {
				utils.ssh.listRemoteProjects.invalidate();
				onClose();
				resetForm();
			},
			onError: (err) => {
				onError(err.message || "Failed to create remote workspace");
			},
		});

	const connectToServer = electronTrpc.ssh.connect.useMutation({
		onSuccess: () => {
			// After connecting, create the remote project
			createRemoteProject.mutate({
				sshConnectionId: selectedConnectionId,
				remotePath: remotePath.trim(),
				name: projectName.trim() || remotePath.split("/").pop() || "Remote Project",
			});
		},
		onError: (err) => {
			onError(err.message || "Failed to connect to server");
		},
	});

	const resetForm = () => {
		setSelectedConnectionId("");
		setRemotePath("");
		setProjectName("");
	};

	const handleConnect = () => {
		if (!selectedConnectionId) {
			onError("Please select a server");
			return;
		}
		if (!remotePath.trim()) {
			onError("Please enter a remote path");
			return;
		}

		// Connect to server and then create project
		connectToServer.mutate({ id: selectedConnectionId });
	};

	if (!isOpen) return null;

	const isLoading =
		connectToServer.isPending ||
		createRemoteProject.isPending ||
		createRemoteWorkspace.isPending;

	const selectedConnection = connections.find(
		(c) => c.id === selectedConnectionId,
	);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
			<div className="bg-card border border-border rounded-lg p-8 w-full max-w-md shadow-2xl">
				<h2 className="text-xl font-normal text-foreground mb-6">
					Open Remote Project
				</h2>

				{loadingConnections ? (
					<div className="text-center py-8 text-muted-foreground">
						Loading servers...
					</div>
				) : connections.length === 0 ? (
					<div className="text-center py-8">
						<HiOutlineServer className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
						<p className="text-muted-foreground mb-4">
							No SSH servers configured
						</p>
						<Link
							to="/settings/ssh"
							className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors text-sm font-medium"
							onClick={onClose}
						>
							<HiOutlineCog6Tooth className="h-4 w-4" />
							Configure SSH Servers
						</Link>
					</div>
				) : (
					<div className="space-y-6">
						{/* Server Selection */}
						<div>
							<label
								htmlFor="server-select"
								className="block text-xs font-normal text-muted-foreground mb-2"
							>
								Server
							</label>
							<select
								id="server-select"
								value={selectedConnectionId}
								onChange={(e) => setSelectedConnectionId(e.target.value)}
								className="w-full px-3 py-2.5 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-ring transition-colors"
								disabled={isLoading}
							>
								<option value="">Select a server...</option>
								{connections.map((conn) => (
									<option key={conn.id} value={conn.id}>
										{conn.name} ({conn.username}@{conn.host})
									</option>
								))}
							</select>
						</div>

						{/* Remote Path */}
						<div>
							<label
								htmlFor="remote-path"
								className="block text-xs font-normal text-muted-foreground mb-2"
							>
								Remote Path
							</label>
							<input
								id="remote-path"
								type="text"
								value={remotePath}
								onChange={(e) => setRemotePath(e.target.value)}
								placeholder={
									selectedConnection?.remoteWorkDir ||
									"/home/user/projects/my-project"
								}
								className="w-full px-3 py-2.5 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring transition-colors"
								disabled={isLoading}
							/>
						</div>

						{/* Project Name (optional) */}
						<div>
							<label
								htmlFor="project-name"
								className="block text-xs font-normal text-muted-foreground mb-2"
							>
								Project Name (optional)
							</label>
							<input
								id="project-name"
								type="text"
								value={projectName}
								onChange={(e) => setProjectName(e.target.value)}
								placeholder="Derived from path if not specified"
								className="w-full px-3 py-2.5 bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-ring transition-colors"
								disabled={isLoading}
							/>
						</div>

						{/* Action Buttons */}
						<div className="flex gap-3 justify-between pt-2">
							<Link
								to="/settings/ssh"
								className="px-4 py-2 rounded-md text-muted-foreground hover:text-foreground transition-colors text-sm"
								onClick={onClose}
							>
								Manage Servers
							</Link>
							<div className="flex gap-3">
								<button
									type="button"
									onClick={() => {
										onClose();
										resetForm();
									}}
									disabled={isLoading}
									className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={handleConnect}
									disabled={isLoading || !selectedConnectionId || !remotePath.trim()}
									className="px-4 py-2 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
								>
									{isLoading ? "Connecting..." : "Connect"}
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
