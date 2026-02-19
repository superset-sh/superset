import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCopy, LuExternalLink } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import {
	APP_OPTIONS,
	JETBRAINS_OPTIONS,
	VSCODE_OPTIONS,
} from "renderer/components/OpenInButton";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ClickablePathProps {
	path: string;
	className?: string;
}

const defaultApp: ExternalApp = "cursor";

export function ClickablePath({ path, className }: ClickablePathProps) {
	const [isOpen, setIsOpen] = useState(false);

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});

	const copyPath = electronTrpc.external.copyPath.useMutation({
		onSuccess: () => toast.success("Path copied to clipboard"),
		onError: (error) => toast.error(`Failed to copy path: ${error.message}`),
	});

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
				{APP_OPTIONS.map((app) => (
					<DropdownMenuItem
						key={app.id}
						onClick={() => handleOpenIn(app.id)}
						className="flex items-center gap-2"
					>
						<img src={app.icon} alt="" className="size-4 object-contain" />
						<span>{app.label}</span>
						{app.id === defaultApp && (
							<span className="ml-auto text-xs text-muted-foreground">
								Default
							</span>
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="flex items-center gap-2">
						<img
							src={vscodeIcon}
							alt="VS Code"
							className="size-4 object-contain"
						/>
						<span>VS Code</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-48">
						{VSCODE_OPTIONS.map((app) => (
							<DropdownMenuItem
								key={app.id}
								onClick={() => handleOpenIn(app.id)}
								className="flex items-center gap-2"
							>
								<img src={app.icon} alt="" className="size-4 object-contain" />
								<span>{app.label}</span>
								{app.id === defaultApp && (
									<span className="ml-auto text-xs text-muted-foreground">
										Default
									</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className="flex items-center gap-2">
						<img
							src={jetbrainsIcon}
							alt="JetBrains"
							className="size-4 object-contain"
						/>
						<span>JetBrains</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-48">
						{JETBRAINS_OPTIONS.map((app) => (
							<DropdownMenuItem
								key={app.id}
								onClick={() => handleOpenIn(app.id)}
								className="flex items-center gap-2"
							>
								<img src={app.icon} alt="" className="size-4 object-contain" />
								<span>{app.label}</span>
								{app.id === defaultApp && (
									<span className="ml-auto text-xs text-muted-foreground">
										Default
									</span>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleCopyPath}
					className="flex items-center gap-2"
				>
					<LuCopy className="size-4" />
					<span>Copy path</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
