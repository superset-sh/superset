import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

function ScriptField({
	label,
	description,
	placeholder,
	value,
	onChange,
}: {
	label: string;
	description?: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-sm font-medium">{label}</Label>
			{description && (
				<p className="text-xs text-muted-foreground">{description}</p>
			)}
			<Textarea
				className="font-mono text-xs min-h-[60px] resize-y"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</div>
	);
}

export function SshSection() {
	const { data: devcontainerScript } =
		electronTrpc.settings.getDevcontainerScript.useQuery();
	const { data: teardownScript } =
		electronTrpc.settings.getTeardownScript.useQuery();

	const setDevcontainerMutation =
		electronTrpc.settings.setDevcontainerScript.useMutation();
	const setTeardownMutation =
		electronTrpc.settings.setTeardownScript.useMutation();

	const [devcontainerValue, setDevcontainerValue] = useState("");
	const [teardownValue, setTeardownValue] = useState("");

	const devcontainerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const teardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (devcontainerScript !== undefined) {
			setDevcontainerValue(devcontainerScript ?? "");
		}
	}, [devcontainerScript]);

	useEffect(() => {
		if (teardownScript !== undefined) {
			setTeardownValue(teardownScript ?? "");
		}
	}, [teardownScript]);

	useEffect(() => {
		return () => {
			if (devcontainerTimerRef.current)
				clearTimeout(devcontainerTimerRef.current);
			if (teardownTimerRef.current) clearTimeout(teardownTimerRef.current);
		};
	}, []);

	const handleDevcontainerChange = useCallback(
		(value: string) => {
			setDevcontainerValue(value);
			if (devcontainerTimerRef.current)
				clearTimeout(devcontainerTimerRef.current);
			devcontainerTimerRef.current = setTimeout(() => {
				devcontainerTimerRef.current = null;
				setDevcontainerMutation.mutate({
					script: value.trim() || null,
				});
			}, 500);
		},
		[setDevcontainerMutation],
	);

	const handleTeardownChange = useCallback(
		(value: string) => {
			setTeardownValue(value);
			if (teardownTimerRef.current) clearTimeout(teardownTimerRef.current);
			teardownTimerRef.current = setTimeout(() => {
				teardownTimerRef.current = null;
				setTeardownMutation.mutate({
					script: value.trim() || null,
				});
			}, 500);
		},
		[setTeardownMutation],
	);

	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<h3 className="text-sm font-semibold">SSH Workspaces</h3>
				<p className="text-xs text-muted-foreground">
					Configure scripts for creating and destroying remote devcontainers.
				</p>
			</div>

			<ScriptField
				label="Devcontainer Script"
				description={
					"Shell command that runs when creating an SSH workspace. " +
					"Env vars: $SUPERSET_REPO_URL, $SUPERSET_BRANCH, $SUPERSET_BRANCH_NO_PREFIX, $SUPERSET_NEW_BRANCH (1 or 0), $SUPERSET_WORKSPACE_NAME, $SUPERSET_WORKSPACE_ID. " +
					"Must print JSON to stdout: { host, port, user, workDir, identityFile?, containerName? }"
				}
				placeholder='outpost create "$SUPERSET_BRANCH_NO_PREFIX" --repo "$SUPERSET_REPO_URL" --branch "$SUPERSET_BRANCH" --json'
				value={devcontainerValue}
				onChange={handleDevcontainerChange}
			/>

			<ScriptField
				label="Teardown Script"
				description="Shell command that runs when deleting an SSH workspace. Env vars: $SUPERSET_CONTAINER_NAME, $SUPERSET_HOST. Failures are non-fatal — the workspace is always deleted locally."
				placeholder='outpost destroy "$SUPERSET_CONTAINER_NAME"'
				value={teardownValue}
				onChange={handleTeardownChange}
			/>
		</div>
	);
}
