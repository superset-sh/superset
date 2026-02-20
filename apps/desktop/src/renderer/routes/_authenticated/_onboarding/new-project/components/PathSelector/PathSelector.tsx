import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { LuFolderOpen } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface PathSelectorProps {
	value: string;
	onChange: (path: string) => void;
	disabled?: boolean;
}

export function PathSelector({ value, onChange, disabled }: PathSelectorProps) {
	const selectDirectory = electronTrpc.projects.selectDirectory.useMutation();

	const handleBrowse = () => {
		selectDirectory.mutate(
			{ defaultPath: value || undefined },
			{
				onSuccess: (result) => {
					if (!result.canceled && result.path) {
						onChange(result.path);
					}
				},
			},
		);
	};

	return (
		<div>
			<label
				htmlFor="project-path"
				className="block text-sm font-medium text-foreground mb-2"
			>
				Location
			</label>
			<div className="flex gap-2">
				<Input
					id="project-path"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					className="flex-1 font-mono text-xs"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={handleBrowse}
					disabled={disabled || selectDirectory.isPending}
					className="shrink-0"
				>
					<LuFolderOpen className="size-4" />
				</Button>
			</div>
		</div>
	);
}
