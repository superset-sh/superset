import { COMPANY } from "@superset/shared/constants";
import { alert } from "@superset/ui/atoms/Alert";
import { Badge } from "@superset/ui/badge";
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
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import {
	HiArrowTopRightOnSquare,
	HiOutlineClipboardDocument,
	HiOutlineKey,
	HiOutlinePlus,
	HiOutlineTrash,
} from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface ApiKeysSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ApiKeysSettings({ visibleItems }: ApiKeysSettingsProps) {
	const collections = useCollections();
	const [isGenerating, setIsGenerating] = useState(false);
	const [showGenerateDialog, setShowGenerateDialog] = useState(false);
	const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyValue, setNewKeyValue] = useState("");
	const [copied, setCopied] = useState(false);

	const { data: apiKeys, isLoading } = useLiveQuery(
		(q) => q.from({ apiKeys: collections.apiKeys }),
		[collections],
	);

	const showApiKeysList = isItemVisible(
		SETTING_ITEM_ID.API_KEYS_LIST,
		visibleItems,
	);
	const showGenerateButton = isItemVisible(
		SETTING_ITEM_ID.API_KEYS_GENERATE,
		visibleItems,
	);

	const handleGenerateKey = async () => {
		if (!newKeyName.trim()) return;

		try {
			setIsGenerating(true);
			const result = await apiTrpcClient.apiKey.create.mutate({
				name: newKeyName.trim(),
			});
			if (result.key) {
				setNewKeyValue(result.key);
				setShowGenerateDialog(false);
				setShowNewKeyDialog(true);
				setNewKeyName("");
			}
		} catch (error) {
			console.error("[api-keys] Failed to generate API key:", error);
		} finally {
			setIsGenerating(false);
		}
	};

	const handleRevokeKey = (id: string, name: string | null) => {
		alert.destructive({
			title: "Revoke API Key",
			description: `Are you sure you want to revoke "${name ?? "Unnamed Key"}"? This action cannot be undone.`,
			confirmText: "Revoke",
			onConfirm: async () => {
				await authClient.apiKey.delete({ keyId: id });
				toast.success("API key revoked");
			},
		});
	};

	const handleCopyKey = () => {
		navigator.clipboard.writeText(newKeyValue);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const formatDate = (date: Date | string | null) => {
		if (!date) return "Never";
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="p-8">
				<div className="max-w-5xl">
					<h2 className="text-2xl font-semibold">API Keys</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Manage API keys for MCP server access and external integrations.{" "}
						<a
							href={`${COMPANY.DOCS_URL}/mcp`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Learn more
							<HiArrowTopRightOnSquare className="h-3 w-3" />
						</a>
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="p-8 space-y-8">
					{showGenerateButton && (
						<div className="max-w-5xl">
							<Button
								onClick={() => setShowGenerateDialog(true)}
								className="gap-2"
							>
								<HiOutlinePlus className="h-4 w-4" />
								Generate New API Key
							</Button>
						</div>
					)}

					<div className="max-w-5xl space-y-4">
						<h3 className="text-lg font-semibold">Your API Keys</h3>
						<p className="text-sm text-muted-foreground">
							API keys allow external applications like Claude Desktop or Claude
							Code to interact with Superset on your behalf.
						</p>

						{showApiKeysList &&
							(isLoading ? (
								<div className="space-y-2 border rounded-lg">
									{[1, 2, 3].map((i) => (
										<div key={i} className="flex items-center gap-4 p-4">
											<Skeleton className="h-8 w-8 rounded" />
											<div className="flex-1 space-y-2">
												<Skeleton className="h-4 w-48" />
												<Skeleton className="h-3 w-32" />
											</div>
											<Skeleton className="h-4 w-20" />
										</div>
									))}
								</div>
							) : !apiKeys || apiKeys.length === 0 ? (
								<div className="text-center py-12 text-muted-foreground border rounded-lg">
									<HiOutlineKey className="h-12 w-12 mx-auto mb-4 opacity-50" />
									<p>No API keys yet</p>
									<p className="text-sm mt-1">
										Generate a key to use with MCP servers
									</p>
								</div>
							) : (
								<div className="border rounded-lg">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Name</TableHead>
												<TableHead>Key</TableHead>
												<TableHead>Created</TableHead>
												<TableHead>Last Used</TableHead>
												<TableHead className="w-[50px]" />
											</TableRow>
										</TableHeader>
										<TableBody>
											{apiKeys.map((key) => (
												<TableRow key={key.id}>
													<TableCell>
														<div className="flex items-center gap-2">
															<HiOutlineKey className="h-4 w-4 text-muted-foreground" />
															<span className="font-medium">
																{key.name ?? "Unnamed Key"}
															</span>
														</div>
													</TableCell>
													<TableCell>
														<Badge variant="outline" className="font-mono">
															{key.start ?? "sk_..."}
														</Badge>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(key.createdAt)}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(key.lastRequest)}
													</TableCell>
													<TableCell>
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8 text-destructive hover:text-destructive"
															onClick={() => handleRevokeKey(key.id, key.name)}
														>
															<HiOutlineTrash className="h-4 w-4" />
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							))}
					</div>
				</div>
			</div>

			{/* Generate Key Dialog */}
			<Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Generate API Key</DialogTitle>
						<DialogDescription>
							Create a new API key for external integrations like Claude Desktop
							or Claude Code.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="key-name">Key Name</Label>
							<Input
								id="key-name"
								placeholder="e.g., Claude Desktop"
								value={newKeyName}
								onChange={(e) => setNewKeyName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleGenerateKey();
								}}
							/>
							<p className="text-xs text-muted-foreground">
								Give your key a descriptive name to remember where it's used.
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowGenerateDialog(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleGenerateKey}
							disabled={!newKeyName.trim() || isGenerating}
						>
							{isGenerating ? "Generating..." : "Generate Key"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* New Key Display Dialog */}
			<Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>API Key Generated</DialogTitle>
						<DialogDescription>
							Copy your API key now. You won't be able to see it again!
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="relative">
							<Input readOnly value={newKeyValue} className="font-mono pr-10" />
							<Button
								variant="ghost"
								size="icon"
								className="absolute right-1 top-1 h-7 w-7"
								onClick={handleCopyKey}
							>
								<HiOutlineClipboardDocument className="h-4 w-4" />
							</Button>
						</div>
						{copied && (
							<p className="text-sm text-green-600">Copied to clipboard!</p>
						)}
						<div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-md p-3">
							<p className="text-sm text-amber-800 dark:text-amber-200">
								Make sure to copy this key now. For security reasons, it will
								not be displayed again.
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button onClick={() => setShowNewKeyDialog(false)}>Done</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
