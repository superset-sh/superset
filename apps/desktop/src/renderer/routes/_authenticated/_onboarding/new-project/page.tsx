import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuArrowLeft, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SupersetLogo } from "renderer/routes/sign-in/components/SupersetLogo";
import { CloneRepoTab } from "./components/CloneRepoTab";
import { EmptyRepoTab } from "./components/EmptyRepoTab";
import { PathSelector } from "./components/PathSelector";
import { TemplateRepoTab } from "./components/TemplateRepoTab";
import type { NewProjectMode } from "./constants";

export const Route = createFileRoute(
	"/_authenticated/_onboarding/new-project/",
)({
	component: NewProjectPage,
});

const TABS: { mode: NewProjectMode; label: string }[] = [
	{ mode: "empty", label: "Empty" },
	{ mode: "clone", label: "Clone" },
	{ mode: "template", label: "Template" },
];

function NewProjectPage() {
	const navigate = useNavigate();
	const [mode, setMode] = useState<NewProjectMode>("empty");
	const [error, setError] = useState<string | null>(null);
	const [parentDir, setParentDir] = useState("");

	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();

	useEffect(() => {
		if (parentDir || !homeDir) return;
		setParentDir(`${homeDir}/.superset/projects`);
	}, [homeDir, parentDir]);

	return (
		<div className="relative flex flex-1 items-center justify-center">
			<div className="flex flex-col items-center w-full max-w-md px-6">
				<SupersetLogo className="h-8 w-auto mb-12 opacity-80" />

				<div className="w-full">
					<div className="flex items-center gap-2 mb-4">
						<button
							type="button"
							onClick={() => navigate({ to: "/", replace: true })}
							className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
						>
							<LuArrowLeft className="size-4" />
						</button>
						<h1 className="text-lg font-medium text-foreground">New Project</h1>
					</div>

					<div className="rounded-xl border border-border/60 bg-card/50 p-5">
						<div className="mb-4">
							<div className="flex p-0.5 bg-muted rounded-md">
								{TABS.map((tab) => (
									<button
										key={tab.mode}
										type="button"
										onClick={() => {
											setMode(tab.mode);
											setError(null);
										}}
										className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
											mode === tab.mode
												? "bg-background text-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										{tab.label}
									</button>
								))}
							</div>
						</div>

						<div className="mb-4">
							<PathSelector value={parentDir} onChange={setParentDir} />
						</div>

						{mode === "empty" && (
							<EmptyRepoTab onError={setError} parentDir={parentDir} />
						)}
						{mode === "clone" && (
							<CloneRepoTab onError={setError} parentDir={parentDir} />
						)}
						{mode === "template" && (
							<TemplateRepoTab onError={setError} parentDir={parentDir} />
						)}
					</div>

					{error && (
						<div className="mt-4 w-full flex items-start gap-2 rounded-md px-4 py-3 bg-destructive/10 border border-destructive/20">
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
	);
}
