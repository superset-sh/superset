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
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface EditSecretDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	organizationId: string;
	secret: {
		id: string;
		key: string;
		value: string;
		sensitive: boolean;
	};
	onSaved: () => void;
}

export function EditSecretDialog({
	open,
	onOpenChange,
	projectId,
	organizationId,
	secret,
	onSaved,
}: EditSecretDialogProps) {
	const [value, setValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (open) {
			// Sensitive secrets never have their value sent from the server
			setValue(secret.sensitive ? "" : secret.value);
		}
	}, [open, secret]);

	const handleSave = async () => {
		if (!value.trim()) return;

		setIsSaving(true);
		try {
			await apiTrpcClient.project.secrets.upsert.mutate({
				projectId,
				organizationId,
				key: secret.key,
				value: value.trim(),
				sensitive: secret.sensitive,
			});
			toast.success(`Updated ${secret.key}`);
			onSaved();
			onOpenChange(false);
		} catch (err) {
			console.error("[secrets/edit] Failed to update:", err);
			toast.error("Failed to update environment variable");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Environment Variable</DialogTitle>
					<DialogDescription>
						Update the value for{" "}
						<code className="font-mono font-semibold text-foreground">
							{secret.key}
						</code>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="space-y-2">
						<span className="text-sm font-medium">Key</span>
						<Input
							value={secret.key}
							disabled
							className="font-mono text-sm bg-muted"
						/>
					</div>

					<div className="space-y-2">
						<span className="text-sm font-medium">Value</span>
						<Input
							placeholder={secret.sensitive ? "Enter new value" : "Value"}
							value={value}
							onChange={(e) => setValue(e.target.value)}
							className="font-mono text-sm"
							type={secret.sensitive ? "password" : "text"}
							autoFocus
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving || !value.trim()}>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
