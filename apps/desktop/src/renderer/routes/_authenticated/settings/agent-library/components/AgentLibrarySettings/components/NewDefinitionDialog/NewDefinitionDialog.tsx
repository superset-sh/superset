import {
	type DefinitionKind,
	NEW_DEFINITION_NAME_PATTERN,
} from "@superset/shared/agent-library";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { ScopeInfo } from "../AgentLibrarySidebar";

export function NewDefinitionDialog({
	open,
	onOpenChange,
	scopes,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scopes: ScopeInfo[];
	onCreated: (ref: {
		scopeKey: string;
		kind: DefinitionKind;
		name: string;
	}) => void;
}) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;

	const [kind, setKind] = useState<DefinitionKind>("agent");
	const [scopeKey, setScopeKey] = useState<string>("user");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const isNameValid = NEW_DEFINITION_NAME_PATTERN.test(name);

	const createMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: `create the ${kind}`,
					}),
				);
			}
			return getHostServiceClientByUrl(activeHostUrl).agentLibrary.create.mutate(
				{ scopeKey, kind, name, description },
			);
		},
		onSuccess: () => {
			toast.success(
				`Created ${kind} "${name}". New skills may need /reload-skills in already-running sessions.`,
			);
			onOpenChange(false);
			onCreated({ scopeKey, kind, name });
			setName("");
			setDescription("");
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to create"),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New {kind}</DialogTitle>
					<DialogDescription>
						Creates {kind === "agent" ? "agents/<name>.md" : "skills/<name>/SKILL.md"}{" "}
						in the chosen scope.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<p className="text-xs text-muted-foreground">Type</p>
							<Select
								value={kind}
								onValueChange={(next) => setKind(next as DefinitionKind)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="agent">Agent</SelectItem>
									<SelectItem value="skill">Skill</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<p className="text-xs text-muted-foreground">Scope</p>
							<Select value={scopeKey} onValueChange={setScopeKey}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{scopes.map((scope) => (
										<SelectItem key={scope.scopeKey} value={scope.scopeKey}>
											{scope.kind === "user"
												? "User (~/.claude)"
												: scope.label || "Project"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="space-y-1.5">
						<p className="text-xs text-muted-foreground">Name</p>
						<Input
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="my-agent"
							aria-invalid={name.length > 0 && !isNameValid}
						/>
						{name.length > 0 && !isNameValid && (
							<p className="text-xs text-destructive">
								Lowercase letters, digits, and hyphens only.
							</p>
						)}
					</div>
					<div className="space-y-1.5">
						<p className="text-xs text-muted-foreground">Description</p>
						<Textarea
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder={
								kind === "agent"
									? "When should the main agent delegate to this subagent?"
									: "When should the model invoke this skill?"
							}
							rows={2}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={!isNameValid || createMutation.isPending}
						onClick={() => createMutation.mutate()}
					>
						{createMutation.isPending ? "Creating…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
