import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	HiOutlineCheck,
	HiOutlineCloud,
	HiOutlineCloudArrowDown,
	HiOutlinePlus,
	HiOutlineServer,
	HiOutlineTrash,
	HiOutlineXMark,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/_authenticated/settings/ssh/")({
	component: SSHSettingsPage,
});

function SSHSettingsPage() {
	const utils = electronTrpc.useUtils();
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
	const [testingId, setTestingId] = useState<string | null>(null);
	const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

	// Queries
	const { data: connections, isLoading } = electronTrpc.ssh.listConnections.useQuery();
	const { data: hasConfig } = electronTrpc.ssh.hasSSHConfig.useQuery();
	const { data: configHosts } = electronTrpc.ssh.getSSHConfigHosts.useQuery();

	// Mutations
	const createConnection = electronTrpc.ssh.createConnection.useMutation({
		onSuccess: () => {
			utils.ssh.listConnections.invalidate();
			setIsAddDialogOpen(false);
		},
	});

	const deleteConnection = electronTrpc.ssh.deleteConnection.useMutation({
		onSuccess: () => {
			utils.ssh.listConnections.invalidate();
		},
	});

	const testConnection = electronTrpc.ssh.testConnection.useMutation({
		onSuccess: (result, variables) => {
			setTestResults((prev) => ({
				...prev,
				[variables.id]: result,
			}));
			setTestingId(null);
		},
		onError: (error, variables) => {
			setTestResults((prev) => ({
				...prev,
				[variables.id]: { success: false, message: error.message },
			}));
			setTestingId(null);
		},
	});

	const [importResult, setImportResult] = useState<{
		imported: string[];
		skipped: string[];
		total: number;
	} | null>(null);

	const importFromConfig = electronTrpc.ssh.importFromSSHConfig.useMutation({
		onSuccess: (result) => {
			utils.ssh.listConnections.invalidate();
			setImportResult(result);
			// Only close if something was imported
			if (result.imported.length > 0) {
				setIsImportDialogOpen(false);
				setImportResult(null);
			}
		},
		onError: (err) => {
			console.error("[ssh/import] Failed to import:", err);
			setImportResult(null);
		},
	});

	const handleTest = (id: string) => {
		setTestingId(id);
		setTestResults((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		testConnection.mutate({ id });
	};

	const handleImportAll = () => {
		importFromConfig.mutate({ skipExisting: true });
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">SSH Remote Servers</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Connect to remote servers via SSH to work on projects hosted elsewhere
				</p>
			</div>

			{/* Import from SSH Config */}
			{hasConfig && configHosts && configHosts.length > 0 && (
				<div className="mb-6 p-4 bg-muted/50 rounded-lg border">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<HiOutlineCloudArrowDown className="h-5 w-5 text-muted-foreground" />
							<div>
								<p className="text-sm font-medium">
									Found {configHosts.length} hosts in ~/.ssh/config
								</p>
								<p className="text-xs text-muted-foreground">
									Import your existing SSH configurations
								</p>
							</div>
						</div>
						<Dialog open={isImportDialogOpen} onOpenChange={(open) => {
							setIsImportDialogOpen(open);
							if (!open) setImportResult(null);
						}}>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm">
									Import Hosts
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Import SSH Hosts</DialogTitle>
									<DialogDescription>
										The following hosts were found in your SSH config file
									</DialogDescription>
								</DialogHeader>
								<div className="max-h-64 overflow-y-auto space-y-2">
									{configHosts.map((host) => {
										const existingNames = new Set(
											(connections ?? []).map((c) => c.name.toLowerCase()),
										);
										const alreadyExists = existingNames.has(host.name.toLowerCase());
										return (
											<div
												key={host.name}
												className={cn(
													"flex items-center justify-between p-2 rounded",
													alreadyExists ? "bg-muted/30 opacity-60" : "bg-muted/50",
												)}
											>
												<div>
													<p className="text-sm font-medium">{host.name}</p>
													<p className="text-xs text-muted-foreground">
														{host.username}@{host.host}:{host.port}
													</p>
												</div>
												<span className="text-xs text-muted-foreground">
													{alreadyExists ? (
														<span className="text-green-500 flex items-center gap-1">
															<HiOutlineCheck className="h-3 w-3" />
															Imported
														</span>
													) : (
														host.authMethod
													)}
												</span>
											</div>
										);
									})}
								</div>
								<DialogFooter className="flex-col gap-2">
								{importResult && importResult.imported.length === 0 && (
									<p className="text-sm text-amber-500 w-full text-left">
										All hosts already exist in your connections.
									</p>
								)}
								<div className="flex gap-3 w-full justify-end">
									<Button
										variant="outline"
										onClick={() => {
											setIsImportDialogOpen(false);
											setImportResult(null);
										}}
									>
										{importResult ? "Close" : "Cancel"}
									</Button>
									{!importResult && (
										<Button
											onClick={handleImportAll}
											disabled={importFromConfig.isPending}
										>
											{importFromConfig.isPending ? "Importing..." : "Import All"}
										</Button>
									)}
								</div>
							</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				</div>
			)}

			{/* Add Connection Button */}
			<div className="mb-6">
				<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<HiOutlinePlus className="h-4 w-4 mr-2" />
							Add SSH Connection
						</Button>
					</DialogTrigger>
					<DialogContent>
						<AddConnectionForm
							onSubmit={(data) => createConnection.mutate(data)}
							isPending={createConnection.isPending}
							onCancel={() => setIsAddDialogOpen(false)}
						/>
					</DialogContent>
				</Dialog>
			</div>

			{/* Connections List */}
			{isLoading ? (
				<div className="text-center py-8 text-muted-foreground">
					Loading connections...
				</div>
			) : connections && connections.length > 0 ? (
				<div className="space-y-3">
					{connections.map((conn) => {
						const testResult = testResults[conn.id];
						const isTesting = testingId === conn.id;

						return (
							<div
								key={conn.id}
								className="flex items-center justify-between p-4 rounded-lg border bg-card"
							>
								<div className="flex items-center gap-4">
									<div
										className={cn(
											"h-10 w-10 rounded-full flex items-center justify-center",
											testResult?.success
												? "bg-green-500/10 text-green-500"
												: "bg-muted text-muted-foreground",
										)}
									>
										<HiOutlineServer className="h-5 w-5" />
									</div>
									<div>
										<p className="font-medium">{conn.name}</p>
										<p className="text-sm text-muted-foreground">
											{conn.username}@{conn.host}:{conn.port}
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2">
									{/* Test Result Badge */}
									{testResult && (
										<div
											className={cn(
												"flex items-center gap-1 px-2 py-1 rounded text-xs",
												testResult.success
													? "bg-green-500/10 text-green-500"
													: "bg-red-500/10 text-red-500",
											)}
										>
											{testResult.success ? (
												<>
													<HiOutlineCheck className="h-3 w-3" />
													Connected
												</>
											) : (
												<>
													<HiOutlineXMark className="h-3 w-3" />
													Failed
												</>
											)}
										</div>
									)}

									{/* Test Button */}
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleTest(conn.id)}
										disabled={isTesting}
									>
										{isTesting ? "Testing..." : "Test"}
									</Button>

									{/* Delete Button */}
									<Button
										variant="ghost"
										size="sm"
										onClick={() => deleteConnection.mutate({ id: conn.id })}
										disabled={deleteConnection.isPending}
									>
										<HiOutlineTrash className="h-4 w-4 text-muted-foreground hover:text-destructive" />
									</Button>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="text-center py-12 border rounded-lg bg-muted/20">
					<HiOutlineCloud className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
					<p className="text-muted-foreground">No SSH connections configured</p>
					<p className="text-sm text-muted-foreground mt-1">
						Add a connection to work on remote projects
					</p>
				</div>
			)}
		</div>
	);
}

function AddConnectionForm({
	onSubmit,
	isPending,
	onCancel,
}: {
	onSubmit: (data: {
		name: string;
		host: string;
		port: number;
		username: string;
		authMethod: "key" | "agent";
		privateKeyPath?: string;
		remoteWorkDir?: string;
	}) => void;
	isPending: boolean;
	onCancel: () => void;
}) {
	const [name, setName] = useState("");
	const [host, setHost] = useState("");
	const [port, setPort] = useState("22");
	const [username, setUsername] = useState("");
	const [authMethod, setAuthMethod] = useState<"key" | "agent">("agent");
	const [privateKeyPath, setPrivateKeyPath] = useState("~/.ssh/id_rsa");
	const [remoteWorkDir, setRemoteWorkDir] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSubmit({
			name,
			host,
			port: parseInt(port, 10),
			username,
			authMethod,
			privateKeyPath: authMethod === "key" ? privateKeyPath : undefined,
			remoteWorkDir: remoteWorkDir || undefined,
		});
	};

	return (
		<form onSubmit={handleSubmit}>
			<DialogHeader>
				<DialogTitle>Add SSH Connection</DialogTitle>
				<DialogDescription>
					Enter the details for your SSH server
				</DialogDescription>
			</DialogHeader>

			<div className="space-y-4 py-4">
				<div className="space-y-2">
					<Label htmlFor="name">Name</Label>
					<Input
						id="name"
						placeholder="My Server"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
					/>
				</div>

				<div className="grid grid-cols-3 gap-3">
					<div className="col-span-2 space-y-2">
						<Label htmlFor="host">Host</Label>
						<Input
							id="host"
							placeholder="192.168.1.100"
							value={host}
							onChange={(e) => setHost(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="port">Port</Label>
						<Input
							id="port"
							type="number"
							placeholder="22"
							value={port}
							onChange={(e) => setPort(e.target.value)}
							required
						/>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="username">Username</Label>
					<Input
						id="username"
						placeholder="user"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="authMethod">Authentication</Label>
					<Select
						value={authMethod}
						onValueChange={(v) => setAuthMethod(v as "key" | "agent")}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="agent">SSH Agent</SelectItem>
							<SelectItem value="key">Private Key</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{authMethod === "key" && (
					<div className="space-y-2">
						<Label htmlFor="privateKeyPath">Private Key Path</Label>
						<Input
							id="privateKeyPath"
							placeholder="~/.ssh/id_rsa"
							value={privateKeyPath}
							onChange={(e) => setPrivateKeyPath(e.target.value)}
						/>
					</div>
				)}

				<div className="space-y-2">
					<Label htmlFor="remoteWorkDir">Default Remote Directory (optional)</Label>
					<Input
						id="remoteWorkDir"
						placeholder="/home/user/projects"
						value={remoteWorkDir}
						onChange={(e) => setRemoteWorkDir(e.target.value)}
					/>
				</div>
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={isPending}>
					{isPending ? "Adding..." : "Add Connection"}
				</Button>
			</DialogFooter>
		</form>
	);
}
