import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuLoader, LuPencil, LuPlus, LuServer, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SETTING_ITEM_ID } from "../../utils/settings-search";
import type { SettingItemId } from "../../utils/settings-search/settings-search";
import { isItemVisible } from "../../utils/settings-search/settings-search";

interface SshConnectionsSettingsProps {
	visibleItems: SettingItemId[] | null;
}

export function SshConnectionsSettings({
	visibleItems,
}: SshConnectionsSettingsProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const { data: connections = [], refetch } =
		electronTrpc.sshConnections.list.useQuery();
	const { data: sshKeys = [] } =
		electronTrpc.sshConnections.listSshKeys.useQuery();
	const { data: agentStatus } =
		electronTrpc.sshConnections.checkSshAgent.useQuery();

	const createMutation = electronTrpc.sshConnections.create.useMutation({
		onSuccess: () => {
			refetch();
			toast.success("SSH connection created");
		},
		onError: (err) => toast.error(err.message),
	});

	const updateMutation = electronTrpc.sshConnections.update.useMutation({
		onSuccess: () => {
			refetch();
			toast.success("SSH connection updated");
		},
		onError: (err) => toast.error(err.message),
	});

	const deleteMutation = electronTrpc.sshConnections.delete.useMutation({
		onSuccess: () => {
			refetch();
			toast.success("SSH connection deleted");
		},
		onError: (err) => toast.error(err.message),
	});

	const testMutation = electronTrpc.sshConnections.testConnection.useMutation({
		onSuccess: (result) => {
			refetch();
			if (result.success) {
				toast.success("Connection successful");
			} else {
				toast.error("Connection failed", { description: result.error });
			}
		},
		onError: (err) => toast.error(err.message),
	});

	const browseMutation =
		electronTrpc.sshConnections.browseKeyFile.useMutation();

	const handleOpenCreate = () => {
		setEditingId(null);
		setIsDialogOpen(true);
	};

	const handleOpenEdit = (id: string) => {
		setEditingId(id);
		setIsDialogOpen(true);
	};

	const editingConnection = editingId
		? connections.find((c) => c.id === editingId)
		: null;

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold">SSH Connections</h2>
				<p className="text-sm text-muted-foreground">
					Manage SSH host configurations for remote workspaces.
				</p>
			</div>

			{isItemVisible(SETTING_ITEM_ID.SSH_CONNECTIONS_LIST, visibleItems) && (
				<div className="space-y-3">
					{connections.length === 0 ? (
						<div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
							<LuServer className="size-8 text-muted-foreground mb-3" />
							<p className="text-sm font-medium">No SSH connections</p>
							<p className="text-xs text-muted-foreground mt-1">
								Add a connection to create remote workspaces.
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{connections.map((conn) => {
								const status = conn.connectionStatus as {
									status: string;
									error?: string;
								} | null;
								const statusValue = status?.status ?? "untested";

								return (
									<div
										key={conn.id}
										className="flex items-center gap-3 rounded-lg border p-3"
									>
										<LuServer className="size-5 text-muted-foreground shrink-0" />
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium truncate">
													{conn.name}
												</span>
												<Badge
													variant={
														statusValue === "connected"
															? "default"
															: statusValue === "failed"
																? "destructive"
																: "secondary"
													}
													className="text-[10px] px-1.5 py-0"
												>
													{statusValue}
												</Badge>
											</div>
											<p className="text-xs text-muted-foreground font-mono truncate">
												{conn.username}@{conn.host}:{conn.port}
											</p>
										</div>
										<div className="flex items-center gap-1 shrink-0">
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs"
												onClick={() => testMutation.mutate({ id: conn.id })}
												disabled={testMutation.isPending}
											>
												{testMutation.isPending ? (
													<LuLoader className="size-3 animate-spin" />
												) : (
													"Test"
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												onClick={() => handleOpenEdit(conn.id)}
											>
												<LuPencil className="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-7 text-destructive hover:text-destructive"
												onClick={() => deleteMutation.mutate({ id: conn.id })}
											>
												<LuTrash2 className="size-3.5" />
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{isItemVisible(SETTING_ITEM_ID.SSH_CONNECTIONS_ADD, visibleItems) && (
				<Button variant="outline" size="sm" onClick={handleOpenCreate}>
					<LuPlus className="size-4 mr-1.5" />
					Add SSH Connection
				</Button>
			)}

			<SshConnectionDialog
				open={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				connection={editingConnection}
				sshKeys={sshKeys}
				agentAvailable={agentStatus?.available ?? false}
				onBrowseKey={async () => {
					const result = await browseMutation.mutateAsync();
					return result.canceled ? null : result.path;
				}}
				onSave={async (values) => {
					if (editingId) {
						await updateMutation.mutateAsync({ id: editingId, ...values });
					} else {
						await createMutation.mutateAsync(values);
					}
					setIsDialogOpen(false);
				}}
				isSaving={createMutation.isPending || updateMutation.isPending}
			/>
		</div>
	);
}

interface SshConnectionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	connection?: {
		name: string;
		host: string;
		port: number;
		username: string;
		authMethod: string;
		privateKeyPath: string | null;
	} | null;
	sshKeys: Array<{ name: string; path: string }>;
	agentAvailable: boolean;
	onBrowseKey: () => Promise<string | null>;
	onSave: (values: {
		name: string;
		host: string;
		port: number;
		username: string;
		authMethod: "key-file" | "ssh-agent";
		privateKeyPath?: string | null;
	}) => Promise<void>;
	isSaving: boolean;
}

function SshConnectionDialog({
	open,
	onOpenChange,
	connection,
	sshKeys,
	agentAvailable,
	onBrowseKey,
	onSave,
	isSaving,
}: SshConnectionDialogProps) {
	const [name, setName] = useState("");
	const [host, setHost] = useState("");
	const [port, setPort] = useState("22");
	const [username, setUsername] = useState("");
	const [authMethod, setAuthMethod] = useState<"key-file" | "ssh-agent">(
		"key-file",
	);
	const [privateKeyPath, setPrivateKeyPath] = useState("");

	// Reset form when dialog opens
	const handleOpenChange = (isOpen: boolean) => {
		if (isOpen) {
			if (connection) {
				setName(connection.name);
				setHost(connection.host);
				setPort(String(connection.port));
				setUsername(connection.username);
				setAuthMethod(connection.authMethod as "key-file" | "ssh-agent");
				setPrivateKeyPath(connection.privateKeyPath ?? "");
			} else {
				setName("");
				setHost("");
				setPort("22");
				setUsername("");
				setAuthMethod("key-file");
				setPrivateKeyPath("");
			}
		}
		onOpenChange(isOpen);
	};

	const handleSave = async () => {
		await onSave({
			name,
			host,
			port: Number.parseInt(port, 10) || 22,
			username,
			authMethod,
			privateKeyPath: authMethod === "key-file" ? privateKeyPath : null,
		});
	};

	const handleBrowse = async () => {
		const path = await onBrowseKey();
		if (path) setPrivateKeyPath(path);
	};

	const isValid =
		name.trim() &&
		host.trim() &&
		username.trim() &&
		(authMethod === "ssh-agent" || privateKeyPath.trim());

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[420px]">
				<DialogHeader>
					<DialogTitle>
						{connection ? "Edit SSH Connection" : "Add SSH Connection"}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="conn-name">Name</Label>
						<Input
							id="conn-name"
							placeholder="My Server"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>

					<div className="grid grid-cols-3 gap-3">
						<div className="col-span-2 space-y-1.5">
							<Label htmlFor="conn-host">Host</Label>
							<Input
								id="conn-host"
								placeholder="192.168.1.100"
								value={host}
								onChange={(e) => setHost(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="conn-port">Port</Label>
							<Input
								id="conn-port"
								placeholder="22"
								value={port}
								onChange={(e) => setPort(e.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="conn-username">Username</Label>
						<Input
							id="conn-username"
							placeholder="root"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
						/>
					</div>

					<div className="space-y-1.5">
						<Label>Authentication</Label>
						<Select
							value={authMethod}
							onValueChange={(v) =>
								setAuthMethod(v as "key-file" | "ssh-agent")
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="key-file">SSH Key File</SelectItem>
								<SelectItem value="ssh-agent" disabled={!agentAvailable}>
									SSH Agent{!agentAvailable && " (unavailable)"}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{authMethod === "key-file" && (
						<div className="space-y-1.5">
							<Label>Private Key</Label>
							<div className="flex gap-2">
								<Input
									className="flex-1 font-mono text-xs"
									placeholder="~/.ssh/id_ed25519"
									value={privateKeyPath}
									onChange={(e) => setPrivateKeyPath(e.target.value)}
								/>
								<Button
									variant="outline"
									size="sm"
									className="shrink-0"
									onClick={handleBrowse}
								>
									Browse
								</Button>
							</div>
							{sshKeys.length > 0 && !privateKeyPath && (
								<div className="flex flex-wrap gap-1 mt-1.5">
									{sshKeys.map((key) => (
										<button
											key={key.path}
											type="button"
											onClick={() => setPrivateKeyPath(key.path)}
											className={cn(
												"text-[11px] px-2 py-0.5 rounded-md border",
												"text-muted-foreground hover:text-foreground hover:border-foreground/20",
												"transition-colors font-mono",
											)}
										>
											{key.name}
										</button>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!isValid || isSaving}>
						{isSaving ? (
							<LuLoader className="size-4 animate-spin mr-1.5" />
						) : null}
						{connection ? "Save" : "Add Connection"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
