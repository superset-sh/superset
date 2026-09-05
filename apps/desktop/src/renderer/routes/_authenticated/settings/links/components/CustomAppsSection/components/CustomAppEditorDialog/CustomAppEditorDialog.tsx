import { Trans, useLingui } from "@lingui/react/macro";
import type { CustomApp } from "@superset/local-db";
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
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface CustomAppFields {
	label: string;
	appName?: string;
	bundleId?: string;
}

interface CustomAppEditorDialogProps {
	open: boolean;
	/** Null when adding a new app. */
	app: CustomApp | null;
	isSaving: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (fields: CustomAppFields) => void;
	onDelete?: () => void;
}

interface FieldProps {
	id: string;
	label: string;
	hint: React.ReactNode;
	children: React.ReactNode;
}

function Field({ id, label, hint, children }: FieldProps) {
	return (
		<div className="py-2.5 space-y-2">
			<div className="space-y-0.5">
				<Label htmlFor={id} className="text-sm font-medium">
					{label}
				</Label>
				<p className="text-xs text-muted-foreground">{hint}</p>
			</div>
			{children}
		</div>
	);
}

export function CustomAppEditorDialog({
	open,
	app,
	isSaving,
	onOpenChange,
	onSave,
	onDelete,
}: CustomAppEditorDialogProps) {
	const { t } = useLingui();
	const [label, setLabel] = useState("");
	const [appName, setAppName] = useState("");
	const [bundleId, setBundleId] = useState("");

	// Reset the draft whenever the dialog opens for a different app.
	useEffect(() => {
		if (!open) return;
		setLabel(app?.label ?? "");
		setAppName(app?.appName ?? "");
		setBundleId(app?.bundleId ?? "");
	}, [open, app]);

	const trimmed = {
		label: label.trim(),
		appName: appName.trim() || undefined,
		bundleId: bundleId.trim() || undefined,
	};
	const hasIdentifier = Boolean(trimmed.appName || trimmed.bundleId);
	const canSave = trimmed.label.length > 0 && hasIdentifier && !isSaving;

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!canSave) return;
		onSave(trimmed);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange} modal>
			<DialogContent className="sm:max-w-lg">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{app ? app.label : <Trans>Add app</Trans>}
						</DialogTitle>
						<DialogDescription>
							<Trans>
								On macOS the bundle id is what launches the app, so it keeps
								working when the app bundle is renamed. The application name is
								the fallback, and the binary name on Linux.
							</Trans>
						</DialogDescription>
					</DialogHeader>

					<div className="mt-2 divide-y divide-border">
						<Field
							id="custom-app-label"
							label={t({ message: "Name" })}
							hint={t({ message: "Shown in the Open in menus." })}
						>
							<Input
								id="custom-app-label"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								placeholder={t({ message: "Xcode Beta" })}
								autoFocus
							/>
						</Field>
						<Field
							id="custom-app-bundle-id"
							label={t({ message: "Bundle id" })}
							hint={t({
								message:
									"Find it with `osascript -e 'id of app \"Xcode\"'` or in the app's Info.plist.",
							})}
						>
							<Input
								id="custom-app-bundle-id"
								className="font-mono text-xs"
								value={bundleId}
								onChange={(e) => setBundleId(e.target.value)}
								placeholder="com.apple.dt.Xcode"
								spellCheck={false}
							/>
						</Field>
						<Field
							id="custom-app-name"
							label={t({ message: "Application name" })}
							hint={t({
								message:
									"The .app name as shown in Finder, without the extension.",
							})}
						>
							<Input
								id="custom-app-name"
								value={appName}
								onChange={(e) => setAppName(e.target.value)}
								placeholder="Xcode-26.5.0"
								spellCheck={false}
							/>
						</Field>
					</div>

					{!hasIdentifier && (
						<p className="mt-3 text-xs text-muted-foreground">
							<Trans>Provide a bundle id or an application name.</Trans>
						</p>
					)}

					<DialogFooter className="mt-4 sm:justify-between">
						{onDelete ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={onDelete}
								disabled={isSaving}
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<Trash2 className="size-4" />
								<Trans>Delete app</Trans>
							</Button>
						) : (
							<span />
						)}
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => onOpenChange(false)}
							>
								<Trans>Cancel</Trans>
							</Button>
							<Button type="submit" size="sm" disabled={!canSave}>
								{app ? <Trans>Save</Trans> : <Trans>Add app</Trans>}
							</Button>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
