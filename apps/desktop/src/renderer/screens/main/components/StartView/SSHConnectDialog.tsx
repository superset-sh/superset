import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Key, Loader2, Lock, Server } from "lucide-react";
import { useId, useState } from "react";
import { trpc } from "renderer/lib/trpc";

interface SSHConnectDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onError: (error: string) => void;
	onConnect: (connectionId: string) => void;
}

type AuthMethod = "key" | "password";

export function SSHConnectDialog({
	isOpen,
	onClose,
	onError,
	onConnect,
}: SSHConnectDialogProps) {
	const formId = useId();
	const testResultId = useId();

	const [name, setName] = useState("");
	const [host, setHost] = useState("");
	const [port, setPort] = useState("22");
	const [username, setUsername] = useState("");
	const [authMethod, setAuthMethod] = useState<AuthMethod>("key");
	const [privateKeyPath, setPrivateKeyPath] = useState("~/.ssh/id_rsa");
	const [password, setPassword] = useState("");
	const [passphrase, setPassphrase] = useState("");
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<{
		success: boolean;
		error?: string;
	} | null>(null);

	const { data: savedConnections = [] } = trpc.ssh.getConnections.useQuery();
	const testConnection = trpc.ssh.testConnection.useMutation();
	const saveConnection = trpc.ssh.saveConnection.useMutation();
	const connect = trpc.ssh.connect.useMutation();
	const selectPrivateKey = trpc.ssh.selectPrivateKey.useMutation();

	const resetForm = () => {
		setName("");
		setHost("");
		setPort("22");
		setUsername("");
		setAuthMethod("key");
		setPrivateKeyPath("~/.ssh/id_rsa");
		setPassword("");
		setPassphrase("");
		setTestResult(null);
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			resetForm();
			onClose();
		}
	};

	const handleSelectSavedConnection = (connectionId: string) => {
		const connection = savedConnections.find((c) => c.id === connectionId);
		if (connection) {
			setName(connection.name);
			setHost(connection.host);
			setPort(String(connection.port));
			setUsername(connection.username);
			setAuthMethod(connection.authMethod);
			if (connection.privateKeyPath) {
				setPrivateKeyPath(connection.privateKeyPath);
			}
			setTestResult(null);
		}
	};

	const handleSelectKeyFile = async () => {
		const result = await selectPrivateKey.mutateAsync();
		if (!result.canceled && result.path) {
			setPrivateKeyPath(result.path);
		}
	};

	const handleTestConnection = async () => {
		if (!host.trim() || !username.trim()) {
			onError("Please enter host and username");
			return;
		}

		setIsTesting(true);
		setTestResult(null);

		try {
			const result = await testConnection.mutateAsync({
				host: host.trim(),
				port: Number.parseInt(port, 10) || 22,
				username: username.trim(),
				authMethod,
				privateKeyPath:
					authMethod === "key" ? privateKeyPath.trim() : undefined,
				password: authMethod === "password" ? password : undefined,
				passphrase: passphrase || undefined,
			});

			setTestResult(result);
		} catch (err) {
			setTestResult({
				success: false,
				error: err instanceof Error ? err.message : "Test failed",
			});
		} finally {
			setIsTesting(false);
		}
	};

	const handleConnect = async (e?: React.FormEvent) => {
		e?.preventDefault();

		if (!host.trim() || !username.trim()) {
			onError("Please enter host and username");
			return;
		}

		try {
			const connectionName = name.trim() || `${username}@${host}:${port}`;
			const savedConnection = await saveConnection.mutateAsync({
				name: connectionName,
				host: host.trim(),
				port: Number.parseInt(port, 10) || 22,
				username: username.trim(),
				authMethod,
				privateKeyPath:
					authMethod === "key" ? privateKeyPath.trim() : undefined,
			});

			const result = await connect.mutateAsync({
				connectionId: savedConnection.id,
				credentials: {
					host: host.trim(),
					port: Number.parseInt(port, 10) || 22,
					username: username.trim(),
					authMethod,
					privateKeyPath:
						authMethod === "key" ? privateKeyPath.trim() : undefined,
					password: authMethod === "password" ? password : undefined,
					passphrase: passphrase || undefined,
				},
			});

			if (result.success) {
				onConnect(savedConnection.id);
				resetForm();
				onClose();
			} else {
				onError(result.error ?? "Failed to connect");
			}
		} catch (err) {
			onError(err instanceof Error ? err.message : "Failed to connect");
		}
	};

	const isLoading =
		testConnection.isPending || saveConnection.isPending || connect.isPending;
	const canSubmit = host.trim() && username.trim() && !isLoading;

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange} modal>
			<DialogContent
				className="max-w-lg max-h-[90vh] overflow-y-auto"
				aria-describedby={`${formId}-description`}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-lg font-normal">
						<Server className="h-5 w-5 text-muted-foreground" aria-hidden />
						Connect via SSH
					</DialogTitle>
					<DialogDescription id={`${formId}-description`}>
						Connect to a remote server using SSH. You can authenticate with an
						SSH key or password.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleConnect} className="space-y-4">
					{/* Saved Connections */}
					{savedConnections.length > 0 && (
						<div className="space-y-2">
							<Label htmlFor={`${formId}-saved`}>Saved Connections</Label>
							<Select onValueChange={handleSelectSavedConnection}>
								<SelectTrigger id={`${formId}-saved`} className="w-full">
									<SelectValue placeholder="Select a saved connection..." />
								</SelectTrigger>
								<SelectContent>
									{savedConnections.map((conn) => (
										<SelectItem key={conn.id} value={conn.id}>
											{conn.name} ({conn.username}@{conn.host})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Connection Name */}
					<div className="space-y-2">
						<Label htmlFor={`${formId}-name`}>
							Connection Name{" "}
							<span className="text-muted-foreground">(optional)</span>
						</Label>
						<Input
							id={`${formId}-name`}
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="My Server"
							disabled={isLoading}
							autoComplete="off"
						/>
					</div>

					{/* Host and Port */}
					<div className="flex gap-3">
						<div className="flex-1 space-y-2">
							<Label htmlFor={`${formId}-host`}>
								Host <span className="text-destructive">*</span>
							</Label>
							<Input
								id={`${formId}-host`}
								type="text"
								value={host}
								onChange={(e) => setHost(e.target.value)}
								placeholder="example.com or 192.168.1.1"
								disabled={isLoading}
								required
								aria-required="true"
								autoComplete="off"
							/>
						</div>
						<div className="w-24 space-y-2">
							<Label htmlFor={`${formId}-port`}>Port</Label>
							<Input
								id={`${formId}-port`}
								type="number"
								value={port}
								onChange={(e) => setPort(e.target.value)}
								placeholder="22"
								disabled={isLoading}
								min={1}
								max={65535}
							/>
						</div>
					</div>

					{/* Username */}
					<div className="space-y-2">
						<Label htmlFor={`${formId}-username`}>
							Username <span className="text-destructive">*</span>
						</Label>
						<Input
							id={`${formId}-username`}
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="root"
							disabled={isLoading}
							required
							aria-required="true"
							autoComplete="username"
						/>
					</div>

					{/* Authentication Method */}
					<fieldset className="space-y-2">
						<legend className="text-sm font-medium">
							Authentication Method
						</legend>
						<div className="flex gap-2">
							<label
								htmlFor={`${formId}-auth-key`}
								className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border transition-colors cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-ring ${
									authMethod === "key"
										? "border-ring bg-accent text-foreground"
										: "border-border text-muted-foreground hover:border-ring hover:text-foreground"
								} ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
							>
								<input
									id={`${formId}-auth-key`}
									type="radio"
									name={`${formId}-auth-method`}
									value="key"
									checked={authMethod === "key"}
									onChange={() => setAuthMethod("key")}
									disabled={isLoading}
									className="sr-only"
								/>
								<Key className="h-4 w-4" aria-hidden />
								<span className="text-sm">SSH Key</span>
							</label>
							<label
								htmlFor={`${formId}-auth-password`}
								className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md border transition-colors cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-ring ${
									authMethod === "password"
										? "border-ring bg-accent text-foreground"
										: "border-border text-muted-foreground hover:border-ring hover:text-foreground"
								} ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
							>
								<input
									id={`${formId}-auth-password`}
									type="radio"
									name={`${formId}-auth-method`}
									value="password"
									checked={authMethod === "password"}
									onChange={() => setAuthMethod("password")}
									disabled={isLoading}
									className="sr-only"
								/>
								<Lock className="h-4 w-4" aria-hidden />
								<span className="text-sm">Password</span>
							</label>
						</div>
					</fieldset>

					{/* SSH Key Path */}
					{authMethod === "key" && (
						<>
							<div className="space-y-2">
								<Label htmlFor={`${formId}-keypath`}>Private Key Path</Label>
								<div className="flex gap-2">
									<Input
										id={`${formId}-keypath`}
										type="text"
										value={privateKeyPath}
										onChange={(e) => setPrivateKeyPath(e.target.value)}
										placeholder="~/.ssh/id_rsa"
										disabled={isLoading}
										className="flex-1"
										autoComplete="off"
									/>
									<Button
										type="button"
										variant="outline"
										onClick={handleSelectKeyFile}
										disabled={isLoading}
									>
										Browse
									</Button>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor={`${formId}-passphrase`}>
									Passphrase{" "}
									<span className="text-muted-foreground">
										(if key is encrypted)
									</span>
								</Label>
								<Input
									id={`${formId}-passphrase`}
									type="password"
									value={passphrase}
									onChange={(e) => setPassphrase(e.target.value)}
									placeholder="Optional"
									disabled={isLoading}
									autoComplete="off"
								/>
							</div>
						</>
					)}

					{/* Password */}
					{authMethod === "password" && (
						<div className="space-y-2">
							<Label htmlFor={`${formId}-password`}>
								Password <span className="text-destructive">*</span>
							</Label>
							<Input
								id={`${formId}-password`}
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Enter password"
								disabled={isLoading}
								required={authMethod === "password"}
								aria-required={authMethod === "password"}
								autoComplete="current-password"
							/>
						</div>
					)}

					{/* Test Result */}
					{testResult && (
						<div
							id={testResultId}
							role="alert"
							aria-live="polite"
							className={`px-3 py-2.5 rounded-md text-sm ${
								testResult.success
									? "bg-green-500/10 text-green-500 border border-green-500/20"
									: "bg-destructive/10 text-destructive border border-destructive/20"
							}`}
						>
							{testResult.success
								? "Connection successful!"
								: `Connection failed: ${testResult.error}`}
						</div>
					)}

					<DialogFooter className="gap-2 sm:gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={handleTestConnection}
							disabled={!canSubmit}
							aria-describedby={testResult ? testResultId : undefined}
						>
							{isTesting && (
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
							)}
							{isTesting ? "Testing..." : "Test Connection"}
						</Button>
						<Button type="submit" disabled={!canSubmit}>
							{connect.isPending && (
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
							)}
							{connect.isPending ? "Connecting..." : "Connect"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
