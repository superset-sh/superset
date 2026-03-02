import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import {
	LuFolderPlus,
	LuGitBranch,
	LuLayoutTemplate,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CloneRepoTab } from "./components/CloneRepoTab";
import { EmptyRepoTab } from "./components/EmptyRepoTab";
import { PathSelector } from "./components/PathSelector";
import { TemplateTab } from "./components/TemplateTab";
import type { NewProjectMode } from "./constants";

export const Route = createFileRoute(
	"/_authenticated/_onboarding/new-project/",
)({
	component: NewProjectPage,
});

const OPTIONS: {
	mode: NewProjectMode;
	label: string;
	description: string;
	icon: typeof LuFolderPlus;
}[] = [
	{
		mode: "empty",
		label: "Empty",
		description: "New git repository from scratch",
		icon: LuFolderPlus,
	},
	{
		mode: "clone",
		label: "Clone",
		description: "Clone from a remote URL",
		icon: LuGitBranch,
	},
	{
		mode: "template",
		label: "Template",
		description: "Start from a project template",
		icon: LuLayoutTemplate,
	},
];

function NewProjectPage() {
	const [mode, setMode] = useState<NewProjectMode>("empty");
	const [error, setError] = useState<string | null>(null);
	const [parentDir, setParentDir] = useState("");

	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/.superset/projects`);
	}, [homeDir, parentDir]);

	return (
		<div className="flex flex-col h-full w-full relative overflow-hidden bg-background">
			<div className="absolute top-4 left-4 z-10">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/">
						<HiArrowLeft className="size-4" />
						Back
					</Link>
				</Button>
			</div>

			<div className="relative flex flex-1 items-center justify-center">
				<div className="flex flex-col items-center w-full max-w-xl px-6">
					<div className="w-full flex flex-col gap-5">
						<h1 className="text-lg font-medium text-foreground">New Project</h1>

						<PathSelector value={parentDir} onChange={setParentDir} />

						<div className="grid grid-cols-3 gap-3">
							{OPTIONS.map((option) => {
								const selected = mode === option.mode;
								return (
									<button
										key={option.mode}
										type="button"
										onClick={() => {
											setMode(option.mode);
											setError(null);
										}}
										className={cn(
											"flex flex-col items-center gap-3 rounded-lg border p-4 pt-5 text-center transition-all",
											selected
												? "border-primary/50 bg-primary/5"
												: "border-border/50 hover:border-border hover:bg-accent/30",
										)}
									>
										<option.icon
											className={cn(
												"size-6",
												selected ? "text-primary" : "text-muted-foreground",
											)}
										/>
										<div>
											<div className="text-sm font-medium text-foreground">
												{option.label}
											</div>
											<div className="text-xs text-muted-foreground mt-0.5">
												{option.description}
											</div>
										</div>
									</button>
								);
							})}
						</div>

						{mode === "empty" && (
							<EmptyRepoTab onError={setError} parentDir={parentDir} />
						)}
						{mode === "clone" && (
							<CloneRepoTab onError={setError} parentDir={parentDir} />
						)}
						{mode === "template" && (
							<TemplateTab onError={setError} parentDir={parentDir} />
						)}

						{error && (
							<div className="w-full flex items-start gap-2 rounded-md px-4 py-3 bg-destructive/10 border border-destructive/20">
								<span className="flex-1 text-sm text-destructive">{error}</span>
								<button
									type="button"
									onClick={() => setError(null)}
									className="shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive transition-colors"
									aria-label="Dismiss error"
								>
									<LuX className="h-3.5 w-3.5" />
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
