import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Loader2, Plus, Settings } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { trpc } from "renderer/lib/trpc";

/**
 * Parses an SSH command or connection string into its components.
 * Supports formats like:
 * - user@hostname
 * - user@hostname:port
 * - ssh user@hostname
 * - ssh user@hostname -p 22
 */
function parseSSHCommand(input: string): {
	host: string;
	port: number;
	username: string;
} | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Remove leading "ssh " if present
	let connectionStr = trimmed.replace(/^ssh\s+/i, "");

	// Extract port from -p flag if present
	let port = 22;
	const portMatch = connectionStr.match(/-p\s+(\d+)/);
	if (portMatch) {
		port = Number.parseInt(portMatch[1], 10);
		connectionStr = connectionStr.replace(/-p\s+\d+\s*/, "").trim();
	}

	// Parse user@host or user@host:port
	const atIndex = connectionStr.indexOf("@");
	if (atIndex === -1) {
		return null; // Username required
	}

	const username = connectionStr.slice(0, atIndex);
	const hostPart = connectionStr.slice(atIndex + 1);

	// Check for port in host:port format
	const colonIndex = hostPart.lastIndexOf(":");
	if (colonIndex > 0 && !hostPart.includes("[")) {
		const possiblePort = Number.parseInt(hostPart.slice(colonIndex + 1), 10);
		if (!Number.isNaN(possiblePort)) {
			return {
				host: hostPart.slice(0, colonIndex),
				port: possiblePort,
				username,
			};
		}
	}

	return { host: hostPart, port, username };
}

export interface SSHConnectionInfo {
	connectionId: string;
	connectionName: string;
}

interface SSHConnectDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onConnect: (info: SSHConnectionInfo) => void;
}

export function SSHConnectDialog({
	isOpen,
	onClose,
	onConnect,
}: SSHConnectDialogProps) {
	const formId = useId();
	const [input, setInput] = useState("");
	const [connectingTo, setConnectingTo] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [passphrase, setPassphrase] = useState("");

	const { data: configHosts = [], isLoading } =
		trpc.ssh.getConfigHosts.useQuery();
	const connectFromConfig = trpc.ssh.connectFromConfig.useMutation();
	const connectMutation = trpc.ssh.connect.useMutation();
	const saveConnection = trpc.ssh.saveConnection.useMutation();
	const openFileInEditor = trpc.external.openFileInEditor.useMutation();

	const utils = trpc.useUtils();

	// Filter hosts based on input
	const filteredHosts = useMemo(() => {
		if (!input.trim()) return configHosts;
		const search = input.toLowerCase();
		return configHosts.filter(
			(host) =>
				host.name.toLowerCase().includes(search) ||
				host.hostName?.toLowerCase().includes(search) ||
				host.user?.toLowerCase().includes(search),
		);
	}, [configHosts, input]);

	// Check if input looks like a new connection (user@host format)
	const parsedInput = useMemo(() => parseSSHCommand(input), [input]);
	const isNewConnection =
		parsedInput &&
		!configHosts.some(
			(h) =>
				h.name.toLowerCase() === input.toLowerCase() ||
				h.hostName?.toLowerCase() === parsedInput.host.toLowerCase(),
		);

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setInput("");
			setConnectingTo(null);
			setError(null);
			setPassphrase("");
			onClose();
		}
	};

	const handleOpenSSHConfig = () => {
		openFileInEditor.mutate({ path: "~/.ssh/config" });
		handleOpenChange(false);
	};

	const handleConnectFromConfig = async (hostName: string) => {
		setError(null);
		setConnectingTo(hostName);

		try {
			const result = await connectFromConfig.mutateAsync({
				hostName,
				passphrase: passphrase || undefined,
			});

			if (result.success && result.connectionId) {
				onConnect({
					connectionId: result.connectionId,
					connectionName: hostName,
				});
				handleOpenChange(false);
			} else {
				setError(result.error ?? "Failed to connect");
				if (!result.error?.toLowerCase().includes("passphrase")) {
					setConnectingTo(null);
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to connect");
			setConnectingTo(null);
		}
	};

	const handleConnectNew = async () => {
		if (!parsedInput) return;

		const connectionName = `${parsedInput.username}@${parsedInput.host}`;
		setError(null);
		setConnectingTo(connectionName);

		try {
			// Save the connection
			const saved = await saveConnection.mutateAsync({
				name: connectionName,
				host: parsedInput.host,
				port: parsedInput.port,
				username: parsedInput.username,
				authMethod: "key",
				privateKeyPath: "~/.ssh/id_rsa",
			});

			// Connect
			const result = await connectMutation.mutateAsync({
				connectionId: saved.id,
				credentials: {
					host: parsedInput.host,
					port: parsedInput.port,
					username: parsedInput.username,
					authMethod: "key",
					privateKeyPath: "~/.ssh/id_rsa",
					passphrase: passphrase || undefined,
				},
			});

			if (result.success) {
				utils.ssh.getConnections.invalidate();
				onConnect({
					connectionId: saved.id,
					connectionName,
				});
				handleOpenChange(false);
			} else {
				setError(result.error ?? "Failed to connect");
				if (!result.error?.toLowerCase().includes("passphrase")) {
					setConnectingTo(null);
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to connect");
			setConnectingTo(null);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			if (needsPassphrase && passphrase) {
				// Retry with passphrase
				if (connectingTo) {
					const configHost = configHosts.find((h) => h.name === connectingTo);
					if (configHost) {
						handleConnectFromConfig(connectingTo);
					} else {
						handleConnectNew();
					}
				}
			} else if (filteredHosts.length === 1) {
				// Connect to the only matching host
				handleConnectFromConfig(filteredHosts[0].name);
			} else if (isNewConnection && parsedInput) {
				// Connect to new host
				handleConnectNew();
			}
		}
	};

	const isConnecting =
		connectFromConfig.isPending ||
		connectMutation.isPending ||
		saveConnection.isPending;
	const needsPassphrase = error?.toLowerCase().includes("passphrase");

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange} modal>
			<DialogContent
				className="max-w-lg p-0 gap-0 overflow-hidden"
				aria-describedby={`${formId}-description`}
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Connect via SSH</DialogTitle>
				<DialogDescription id={`${formId}-description`} className="sr-only">
					Select configured SSH host or enter user@host
				</DialogDescription>

				{/* Command palette input */}
				<div className="border-b px-3 py-2">
					<Input
						placeholder="e.g. ubuntu@ec2-3-106-99.amazonaws.com, or named host below"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={isConnecting}
						className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-8"
						autoFocus
					/>
				</div>

				{/* Passphrase input when needed */}
				{needsPassphrase && (
					<div className="border-b px-3 py-2 bg-muted/30">
						<Input
							type="password"
							placeholder="Enter passphrase for SSH key"
							value={passphrase}
							onChange={(e) => setPassphrase(e.target.value)}
							onKeyDown={handleKeyDown}
							disabled={isConnecting}
							className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-8"
							autoFocus
						/>
					</div>
				)}

				{/* Error display */}
				{error && !needsPassphrase && (
					<div className="px-3 py-2 text-sm text-destructive bg-destructive/10 border-b">
						{error}
					</div>
				)}

				{/* Host list */}
				<div className="max-h-64 overflow-y-auto">
					{isLoading && (
						<div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin mr-2" />
							Loading...
						</div>
					)}

					{!isLoading && (
						<>
							{/* Show matching hosts from config */}
							{filteredHosts.map((host) => (
								<button
									key={host.name}
									type="button"
									onClick={() => handleConnectFromConfig(host.name)}
									disabled={isConnecting}
									className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
										connectingTo === host.name
											? "bg-accent"
											: "hover:bg-accent/50"
									} disabled:opacity-50`}
								>
									<span className="truncate">{host.name}</span>
									{connectingTo === host.name && isConnecting ? (
										<Loader2 className="h-3 w-3 animate-spin ml-2 flex-shrink-0" />
									) : (
										<span className="text-muted-foreground text-xs ml-2 truncate">
											{host.user && `${host.user}@`}
											{host.hostName || host.name}
										</span>
									)}
								</button>
							))}

							{/* Show option to connect to typed input if it's a valid new connection */}
							{isNewConnection && parsedInput && (
								<button
									type="button"
									onClick={handleConnectNew}
									disabled={isConnecting}
									className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
										connectingTo ===
										`${parsedInput.username}@${parsedInput.host}`
											? "bg-accent"
											: "hover:bg-accent/50"
									} disabled:opacity-50`}
								>
									{connectingTo ===
										`${parsedInput.username}@${parsedInput.host}` &&
									isConnecting ? (
										<Loader2 className="h-3 w-3 animate-spin mr-2 flex-shrink-0" />
									) : null}
									<span className="truncate">
										{parsedInput.username}@{parsedInput.host}
										{parsedInput.port !== 22 && `:${parsedInput.port}`}
									</span>
									<span className="text-muted-foreground text-xs ml-2">
										Connect
									</span>
								</button>
							)}

							{/* Divider */}
							{(filteredHosts.length > 0 || isNewConnection) && (
								<div className="border-t my-1" />
							)}

							{/* Add New SSH Host */}
							<button
								type="button"
								onClick={handleOpenSSHConfig}
								disabled={isConnecting}
								className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
							>
								<Plus className="h-4 w-4 mr-2 text-muted-foreground" />
								Add New SSH Host...
							</button>

							{/* Configure SSH Hosts */}
							<button
								type="button"
								onClick={handleOpenSSHConfig}
								disabled={isConnecting}
								className="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
							>
								<Settings className="h-4 w-4 mr-2 text-muted-foreground" />
								Configure SSH Hosts...
							</button>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
