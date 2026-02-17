import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "../../constants";
import { useProjectCreationHandler } from "../../hooks/useProjectCreationHandler";

interface TemplateRepoTabProps {
	onClose: () => void;
	onError: (error: string) => void;
}

export function TemplateRepoTab({ onClose, onError }: TemplateRepoTabProps) {
	const [selectedTemplate, setSelectedTemplate] =
		useState<ProjectTemplate | null>(null);
	const [customUrl, setCustomUrl] = useState("");
	const [nameOverride, setNameOverride] = useState("");
	const createFromTemplate =
		electronTrpc.projects.createFromTemplate.useMutation();
	const { handleResult, handleError, isCreatingWorkspace } =
		useProjectCreationHandler(onClose, onError);

	const isLoading = createFromTemplate.isPending || isCreatingWorkspace;

	const handleCreate = () => {
		const templateUrl = selectedTemplate?.url || customUrl.trim();
		if (!templateUrl) {
			onError("Please select a template or enter a custom URL");
			return;
		}

		createFromTemplate.mutate(
			{
				templateUrl,
				name: nameOverride.trim() || undefined,
			},
			{
				onSuccess: (result) =>
					handleResult(result, () => {
						setSelectedTemplate(null);
						setCustomUrl("");
						setNameOverride("");
					}),
				onError: handleError,
			},
		);
	};

	return (
		<div className="flex flex-col gap-4 px-4 pb-4">
			<div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
				{PROJECT_TEMPLATES.map((template) => (
					<button
						key={template.id}
						type="button"
						onClick={() => {
							setSelectedTemplate(
								selectedTemplate?.id === template.id ? null : template,
							);
							setCustomUrl("");
						}}
						disabled={isLoading}
						className={cn(
							"flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
							selectedTemplate?.id === template.id
								? "border-primary bg-primary/5"
								: "border-border hover:border-primary/40 hover:bg-accent/50",
						)}
					>
						<span className="text-sm font-medium text-foreground">
							{template.name}
						</span>
						<span className="text-xs text-muted-foreground line-clamp-2">
							{template.description}
						</span>
					</button>
				))}
			</div>

			<div>
				<label
					htmlFor="custom-template-url"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Or enter a custom template URL
				</label>
				<Input
					id="custom-template-url"
					value={customUrl}
					onChange={(e) => {
						setCustomUrl(e.target.value);
						if (e.target.value.trim()) {
							setSelectedTemplate(null);
						}
					}}
					placeholder="https://github.com/user/template-repo.git"
					disabled={isLoading}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !isLoading) {
							handleCreate();
						}
					}}
				/>
			</div>

			<div>
				<label
					htmlFor="template-name-override"
					className="block text-sm font-medium text-foreground mb-2"
				>
					Project Name{" "}
					<span className="text-muted-foreground font-normal">(optional)</span>
				</label>
				<Input
					id="template-name-override"
					value={nameOverride}
					onChange={(e) => setNameOverride(e.target.value)}
					placeholder="Derived from template URL if empty"
					disabled={isLoading}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !isLoading) {
							handleCreate();
						}
					}}
				/>
			</div>

			<div className="flex justify-end gap-2">
				<Button onClick={handleCreate} disabled={isLoading} size="sm">
					{isLoading ? "Creating..." : "Create from Template"}
				</Button>
			</div>
		</div>
	);
}
