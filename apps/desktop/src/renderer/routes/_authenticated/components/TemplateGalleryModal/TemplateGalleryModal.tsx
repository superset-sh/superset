import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { TemplateCard } from "./components/TemplateCard";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates";

interface TemplateGalleryModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (result: ProjectSetupResult) => void;
	onError?: (message: string) => void;
}

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

export function TemplateGalleryModal({
	open,
	onOpenChange,
	onCreated,
	onError,
}: TemplateGalleryModalProps) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const parentDir = homeDir ? `${homeDir}/.superset/projects` : null;
	const [cloningId, setCloningId] = useState<string | null>(null);

	const handleSelect = async (template: ProjectTemplate) => {
		if (!template.repo || cloningId) return;
		if (!activeHostUrl) {
			showHostServiceUnavailableToast(hostService, {
				action: "create the project",
			});
			return;
		}
		if (!parentDir) return;
		setCloningId(template.id);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const result = await client.project.create.mutate({
				name: deriveProjectNameFromUrl(template.repo),
				mode: { kind: "template", parentDir, url: template.repo },
			});
			finalizeSetup(activeHostUrl, result);
			onCreated(result);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (onError) onError(message);
			else toast.error("Could not create project", { description: message });
		} finally {
			setCloningId(null);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && cloningId) return;
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-5xl">
				<DialogHeader>
					<DialogTitle>Start from a template</DialogTitle>
					<DialogDescription>
						Scaffold a new project from a starter, cloned with a fresh git
						history.
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-3 gap-3">
					{PROJECT_TEMPLATES.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							cloning={cloningId === template.id}
							disabled={cloningId !== null}
							onSelect={handleSelect}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
