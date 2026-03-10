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
import { useState } from "react";
import { LuLoader, LuPencil, LuPlus, LuServer, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface SshHostsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

type AuthMethod = "password" | "privateKey" | "agent";

interface HostFormState {
	label: string;
	hostname: string;
	port: string;
	username: string;
	authMethod: AuthMethod;
	privateKeyPath: string;
	defaultDirectory: string;
}

const DEFAULT_FORM: HostFormState = {
	label: "",
	hostname: "",
	port: "22",
	username: "",
	authMethod: "agent",
	privateKeyPath: "",
	defaultDirectory: "",
};

function ConnectionStatusBadge({ id }: { id: string }) {
	const { data: status } = electronTrpc.sshHosts.getConnectionStatus.useQuery(
		{ id },
		{ refetchInterval: 5000 },
	);

	const isConnected = status?.state === "connected";

	return (
		<span
			className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
				isConnected
					? "bg-green-500/15 text-green-600 dark:text-green-400"
					: "bg-muted text-muted-foreground"
			}`}
		>
			<span
				className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-green-500" : "bg-muted-foreground/50"}`}
			/>
			{isConnected ? "Connected" : "Disconnected"}
		</span>
	);
}

interface HostFormProps {
	initial?: HostFormState;
	onSave: (form: HostFormState) => void;
	onCancel: () => void;
	isSaving: boolean;
	isTestingConnection: boolean;
	onTestConnection: (form: HostFormState) => void;
	testResult?: { success: boolean; message?: string } | null;
}

function HostForm({
	initial = DEFAULT_FORM,
	onSave,
	onCancel,
	isSaving,
	isTestingConnection,
	onTestConnection,
	testResult,
}: HostFormProps) {
	const [form, setForm] = useState<HostFormState>(initial);

	const set = (field: keyof HostFormState) => (value: string) =>
		setForm((prev) => ({ ...prev, [field]: value }));

	return (
		<div className="space-y-4 p-4 border rounded-lg bg-muted/30">
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label htmlFor="label">Label</Label>
					<Input
						id="label"
						placeholder="My Server"
						value={form.label}
						onChange={(e) => set("label")(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="hostname">Hostname</Label>
					<Input
						id="hostname"
						placeholder="example.com or 192.168.1.1"
						value={form.hostname}
						onChange={(e) => set("hostname")(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="username">Username</Label>
					<Input
						id="username"
						placeholder="ubuntu"
						value={form.username}
						onChange={(e) => set("username")(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="port">Port</Label>
					<Input
						id="port"
						placeholder="22"
						value={form.port}
						onChange={(e) => set("port")(e.target.value)}
					/>
				</div>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="auth-method">Authentication Method</Label>
				<Select
					value={form.authMethod}
					onValueChange={(v) => set("authMethod")(v as AuthMethod)}
				>
					<SelectTrigger id="auth-method">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="agent">SSH Agent</SelectItem>
						<SelectItem value="privateKey">Private Key</SelectItem>
						<SelectItem value="password">Password</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{form.authMethod === "privateKey" && (
				<div className="space-y-1.5">
					<Label htmlFor="private-key-path">Private Key Path</Label>
					<Input
						id="private-key-path"
						placeholder="~/.ssh/id_rsa"
						value={form.privateKeyPath}
						onChange={(e) => set("privateKeyPath")(e.target.value)}
					/>
				</div>
			)}

			<div className="space-y-1.5">
				<Label htmlFor="default-dir">Default Directory</Label>
				<Input
					id="default-dir"
					placeholder="~/projects"
					value={form.defaultDirectory}
					onChange={(e) => set("defaultDirectory")(e.target.value)}
				/>
			</div>

			{testResult && (
				<p
					className={`text-sm ${testResult.success ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
				>
					{testResult.message}
				</p>
			)}

			<div className="flex items-center gap-2 pt-1">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onTestConnection(form)}
					disabled={isTestingConnection || !form.hostname || !form.username}
				>
					{isTestingConnection && (
						<LuLoader className="h-3.5 w-3.5 mr-1.5 animate-spin" />
					)}
					Test Connection
				</Button>
				<div className="flex-1" />
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					size="sm"
					onClick={() => onSave(form)}
					disabled={isSaving || !form.label || !form.hostname || !form.username}
				>
					{isSaving && <LuLoader className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
					Save Host
				</Button>
			</div>
		</div>
	);
}

export function SshHostsSettings({ visibleItems }: SshHostsSettingsProps) {
	const showHostsList = isItemVisible(
		SETTING_ITEM_ID.SSH_HOSTS_LIST,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();

	const { data: hosts = [] } = electronTrpc.sshHosts.list.useQuery();

	const createHost = electronTrpc.sshHosts.create.useMutation({
		onSuccess: () => utils.sshHosts.list.invalidate(),
	});
	const updateHost = electronTrpc.sshHosts.update.useMutation({
		onSuccess: () => utils.sshHosts.list.invalidate(),
	});
	const deleteHost = electronTrpc.sshHosts.delete.useMutation({
		onSuccess: () => utils.sshHosts.list.invalidate(),
	});
	const testConnection = electronTrpc.sshHosts.testConnection.useMutation();
	const connectHost = electronTrpc.sshHosts.connect.useMutation({
		onSuccess: () => utils.sshHosts.list.invalidate(),
	});
	const disconnectHost = electronTrpc.sshHosts.disconnect.useMutation({
		onSuccess: () => utils.sshHosts.list.invalidate(),
	});

	const [showAddForm, setShowAddForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const handleTestConnection = async (form: HostFormState) => {
		setTestResult(null);
		try {
			const result = await testConnection.mutateAsync({
				hostname: form.hostname,
				port: Number(form.port) || 22,
				username: form.username,
				authMethod: form.authMethod,
				privateKeyPath: form.privateKeyPath || undefined,
			});
			setTestResult({
				success: result.success,
				message:
					result.error ??
					(result.success ? "Connection successful" : "Connection failed"),
			});
		} catch (err) {
			setTestResult({
				success: false,
				message: err instanceof Error ? err.message : "Connection failed",
			});
		}
	};

	const handleSaveNew = async (form: HostFormState) => {
		await createHost.mutateAsync({
			label: form.label,
			hostname: form.hostname,
			port: Number(form.port) || 22,
			username: form.username,
			authMethod: form.authMethod,
			privateKeyPath: form.privateKeyPath || undefined,
			defaultDirectory: form.defaultDirectory || undefined,
		});
		setShowAddForm(false);
		setTestResult(null);
	};

	const handleSaveEdit = async (id: string, form: HostFormState) => {
		await updateHost.mutateAsync({
			id,
			label: form.label,
			hostname: form.hostname,
			port: Number(form.port) || 22,
			username: form.username,
			authMethod: form.authMethod,
			privateKeyPath: form.privateKeyPath || undefined,
			defaultDirectory: form.defaultDirectory || undefined,
		});
		setEditingId(null);
		setTestResult(null);
	};

	if (!showHostsList) return null;

	return (
		<div className="p-6 max-w-7xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">SSH Hosts</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Manage SSH remote hosts for remote workspaces
				</p>
			</div>

			<div className="space-y-4">
				{hosts.length === 0 && !showAddForm && (
					<div className="flex flex-col items-center justify-center py-12 border rounded-lg border-dashed text-center gap-3">
						<LuServer className="h-8 w-8 text-muted-foreground/40" />
						<div>
							<p className="text-sm font-medium">No SSH hosts configured</p>
							<p className="text-xs text-muted-foreground mt-1">
								Add a host to connect to remote servers
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setShowAddForm(true)}
						>
							<LuPlus className="h-4 w-4 mr-1.5" />
							Add Host
						</Button>
					</div>
				)}

				{hosts.map((host) =>
					editingId === host.id ? (
						<HostForm
							key={host.id}
							initial={{
								label: host.label,
								hostname: host.hostname,
								port: String(host.port ?? 22),
								username: host.username,
								authMethod: (host.authMethod as AuthMethod) ?? "agent",
								privateKeyPath: host.privateKeyPath ?? "",
								defaultDirectory: host.defaultDirectory ?? "",
							}}
							onSave={(form) => handleSaveEdit(host.id, form)}
							onCancel={() => {
								setEditingId(null);
								setTestResult(null);
							}}
							isSaving={updateHost.isPending}
							isTestingConnection={testConnection.isPending}
							onTestConnection={handleTestConnection}
							testResult={testResult}
						/>
					) : (
						<div
							key={host.id}
							className="flex items-center gap-4 p-4 border rounded-lg bg-background"
						>
							<LuServer className="h-5 w-5 text-muted-foreground shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<p className="text-sm font-medium truncate">{host.label}</p>
									<ConnectionStatusBadge id={host.id} />
								</div>
								<p className="text-xs text-muted-foreground mt-0.5 truncate">
									{host.username}@{host.hostname}:{host.port ?? 22}
								</p>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										connectHost.isPending
											? null
											: connectHost.mutate({ id: host.id })
									}
									disabled={connectHost.isPending}
								>
									Connect
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() =>
										disconnectHost.isPending
											? null
											: disconnectHost.mutate({ id: host.id })
									}
									disabled={disconnectHost.isPending}
								>
									Disconnect
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => setEditingId(host.id)}
								>
									<LuPencil className="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-destructive hover:text-destructive"
									onClick={() => deleteHost.mutate({ id: host.id })}
									disabled={deleteHost.isPending}
								>
									<LuTrash2 className="h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					),
				)}

				{showAddForm && (
					<HostForm
						onSave={handleSaveNew}
						onCancel={() => {
							setShowAddForm(false);
							setTestResult(null);
						}}
						isSaving={createHost.isPending}
						isTestingConnection={testConnection.isPending}
						onTestConnection={handleTestConnection}
						testResult={testResult}
					/>
				)}

				{hosts.length > 0 && !showAddForm && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowAddForm(true)}
					>
						<LuPlus className="h-4 w-4 mr-1.5" />
						Add Host
					</Button>
				)}
			</div>
		</div>
	);
}
