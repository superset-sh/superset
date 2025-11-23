import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

interface SSHConnectDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onError: (error: string) => void;
}

export function SSHConnectDialog({
	isOpen,
	onClose,
	onError,
}: SSHConnectDialogProps) {
	const [host, setHost] = useState("");
	const [username, setUsername] = useState("");
	const [port, setPort] = useState("22");
	const connectSSH = trpc.projects.connectSSH.useMutation();
	const createWorkspace = useCreateWorkspace();

	const handleConnect = async () => {
		if (!host.trim()) {
			onError("Please enter a host");
			return;
		}
		if (!username.trim()) {
			onError("Please enter a username");
			return;
		}

		const portNum = Number.parseInt(port, 10);
		if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
			onError("Please enter a valid port number");
			return;
		}

		connectSSH.mutate(
			{
				host: host.trim(),
				username: username.trim(),
				port: portNum,
			},
			{
				onSuccess: (result) => {
					if (result.success && result.project) {
						createWorkspace.mutate({ projectId: result.project.id });
						onClose();
						setHost("");
						setUsername("");
						setPort("22");
					} else if (!result.success && result.error) {
						onError(result.error);
					}
				},
				onError: (err) => {
					onError(err.message || "Failed to connect via SSH");
				},
			},
		);
	};

	if (!isOpen) return null;

	const isLoading = connectSSH.isPending || createWorkspace.isPending;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
			<div className="bg-[#201E1C] border border-[#2A2827] rounded-lg p-8 w-full max-w-md shadow-2xl">
				<h2 className="text-xl font-normal text-[#eae8e6] mb-6">
					Connect via SSH
				</h2>

				<div className="space-y-5">
					<div>
						<label
							htmlFor="ssh-host"
							className="block text-xs font-normal text-[#a8a5a3] mb-2"
						>
							Host
						</label>
						<input
							id="ssh-host"
							type="text"
							value={host}
							onChange={(e) => setHost(e.target.value)}
							placeholder="example.com or 192.168.1.1"
							className="w-full px-3 py-2.5 bg-[#151110] border border-[#2A2827] rounded-md text-[#eae8e6] placeholder:text-[#a8a5a3]/50 focus:outline-none focus:border-[#3A3837] transition-colors"
							disabled={isLoading}
						/>
					</div>

					<div>
						<label
							htmlFor="ssh-username"
							className="block text-xs font-normal text-[#a8a5a3] mb-2"
						>
							Username
						</label>
						<input
							id="ssh-username"
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="user"
							className="w-full px-3 py-2.5 bg-[#151110] border border-[#2A2827] rounded-md text-[#eae8e6] placeholder:text-[#a8a5a3]/50 focus:outline-none focus:border-[#3A3837] transition-colors"
							disabled={isLoading}
						/>
					</div>

					<div>
						<label
							htmlFor="ssh-port"
							className="block text-xs font-normal text-[#a8a5a3] mb-2"
						>
							Port
						</label>
						<input
							id="ssh-port"
							type="text"
							value={port}
							onChange={(e) => setPort(e.target.value)}
							placeholder="22"
							className="w-full px-3 py-2.5 bg-[#151110] border border-[#2A2827] rounded-md text-[#eae8e6] placeholder:text-[#a8a5a3]/50 focus:outline-none focus:border-[#3A3837] transition-colors"
							disabled={isLoading}
						/>
					</div>

					<div className="flex gap-3 justify-end pt-2">
						<button
							type="button"
							onClick={onClose}
							disabled={isLoading}
							className="px-4 py-2 rounded-md border border-[#2A2827] text-[#eae8e6] hover:bg-[#2A2827] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleConnect}
							disabled={isLoading}
							className="px-4 py-2 rounded-md bg-[#eae8e6] text-[#151110] hover:bg-[#d4d2d0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
						>
							{isLoading ? "Connecting..." : "Connect"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
