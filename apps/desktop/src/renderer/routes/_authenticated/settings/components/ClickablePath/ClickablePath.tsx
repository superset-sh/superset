import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { OpenInExternalDropdownItems } from "renderer/components/OpenInExternalDropdown";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useThemeStore } from "renderer/stores/theme";

interface ClickablePathProps {
	path: string;
	className?: string;
}

export function ClickablePath({ path, className }: ClickablePathProps) {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const [isOpen, setIsOpen] = useState(false);
	const utils = electronTrpc.useUtils();
	// Uses global default editor (no project context on the settings page).
	// No projectId is passed to openInApp, so per-project defaults are not affected.
	const { data: defaultApp } =
		electronTrpc.settings.getDefaultEditor.useQuery();

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: () => {
			utils.settings.getDefaultEditor.invalidate();
		},
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});

	const copyPath = electronTrpc.external.copyPath.useMutation({
		onSuccess: () => toast.success("Path copied to clipboard"),
		onError: (error) => toast.error(`Failed to copy path: ${error.message}`),
	});

	const isDark = activeTheme?.type === "dark";

	const handleOpenIn = (app: ExternalApp) => {
		openInApp.mutate({ path, app });
		setIsOpen(false);
	};

	const handleCopyPath = () => {
		copyPath.mutate(path);
		setIsOpen(false);
	};

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"group inline-flex items-center gap-2 text-sm font-mono break-all text-left",
						"text-primary underline decoration-primary/40 underline-offset-2",
						"hover:decoration-primary transition-colors cursor-pointer",
						className,
					)}
				>
					<span>{path}</span>
					<LuExternalLink className="size-3.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<OpenInExternalDropdownItems
					isDark={isDark}
					activeApp={defaultApp ?? undefined}
					onOpenIn={handleOpenIn}
					onCopyPath={handleCopyPath}
					renderAppTrailing={(appId) =>
						appId === defaultApp ? (
							<span className="ml-auto text-xs text-muted-foreground">
								Default
							</span>
						) : null
					}
					appItemClassName="flex items-center gap-2"
					subTriggerClassName="flex items-center gap-2"
					subContentClassName="w-48"
					copyPathItemClassName="flex items-center gap-2"
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
