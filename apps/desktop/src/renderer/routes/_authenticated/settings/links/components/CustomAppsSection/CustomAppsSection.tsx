import { Trans, useLingui } from "@lingui/react/macro";
import type { CustomApp } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef, useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	CustomAppEditorDialog,
	type CustomAppFields,
} from "./components/CustomAppEditorDialog";
import { CustomAppRow } from "./components/CustomAppRow";

type EditorState =
	| { mode: "closed" }
	| { mode: "new" }
	| { mode: "edit"; app: CustomApp };

/**
 * Apps Superset doesn't ship a built-in entry for. They show up under
 * "Custom" in every "Open in" menu and can be picked as the editor the
 * click actions above open. Same shell as the terminal scripts section:
 * a divided container with rows that open an editor dialog.
 */
interface CustomAppsSectionProps {
	openAddApp?: boolean;
	onAddAppHandled?: () => void;
}

export function CustomAppsSection({
	openAddApp,
	onAddAppHandled,
}: CustomAppsSectionProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const utils = electronTrpc.useUtils();
	const { data: customApps = [], isLoading } =
		electronTrpc.settings.getCustomApps.useQuery();

	const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
	const close = () => setEditor({ mode: "closed" });
	const sectionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!openAddApp) return;
		setEditor({ mode: "new" });
		sectionRef.current?.scrollIntoView({ block: "center" });
		onAddAppHandled?.();
	}, [openAddApp, onAddAppHandled]);

	const invalidate = () => {
		utils.settings.getCustomApps.invalidate();
	};
	const onError = (error: { message: string }) => toast.error(error.message);

	const createCustomApp = electronTrpc.settings.createCustomApp.useMutation({
		onSuccess: close,
		onSettled: invalidate,
		onError,
	});
	const updateCustomApp = electronTrpc.settings.updateCustomApp.useMutation({
		onSuccess: close,
		onSettled: invalidate,
		onError,
	});
	const deleteCustomApp = electronTrpc.settings.deleteCustomApp.useMutation({
		onSuccess: close,
		onSettled: invalidate,
		onError,
	});

	const handleSave = (fields: CustomAppFields) => {
		if (editor.mode === "edit") {
			updateCustomApp.mutate({ id: editor.app.id, patch: fields });
		} else {
			createCustomApp.mutate(fields);
		}
	};

	const isSaving = createCustomApp.isPending || updateCustomApp.isPending;

	return (
		<div ref={sectionRef}>
			<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
				<div className="flex items-start justify-between gap-3 p-4">
					<div className="min-w-0">
						<h3 className="text-sm font-medium">
							<HighlightText
								text={t({ message: "Custom apps" })}
								query={searchQuery}
							/>
						</h3>
						<p className="text-xs text-muted-foreground mt-0.5">
							<Trans>
								Editors and tools Superset doesn't list yet. They appear under
								"Custom" in every Open in menu and can be the editor the actions
								above open.
							</Trans>
						</p>
					</div>
					<Button
						size="sm"
						className="shrink-0"
						onClick={() => setEditor({ mode: "new" })}
					>
						<HiOutlinePlus className="size-4" />
						<Trans>Add app</Trans>
					</Button>
				</div>

				{isLoading ? (
					<div className="py-8 text-center text-sm text-muted-foreground">
						<Trans>Loading custom apps...</Trans>
					</div>
				) : customApps.length > 0 ? (
					customApps.map((app) => (
						<CustomAppRow
							key={app.id}
							app={app}
							onEdit={() => setEditor({ mode: "edit", app })}
							onDelete={() => deleteCustomApp.mutate({ id: app.id })}
						/>
					))
				) : (
					<div className="py-10 text-center text-sm text-muted-foreground">
						<Trans>
							No custom apps yet. Click "Add app" to register one by bundle id
							or application name.
						</Trans>
					</div>
				)}
			</div>

			<CustomAppEditorDialog
				open={editor.mode !== "closed"}
				app={editor.mode === "edit" ? editor.app : null}
				isSaving={isSaving}
				onOpenChange={(open) => !open && close()}
				onSave={handleSave}
				onDelete={
					editor.mode === "edit"
						? () => deleteCustomApp.mutate({ id: editor.app.id })
						: undefined
				}
			/>
		</div>
	);
}
