import { Button } from "@superset/ui/button";
import { CardFooter } from "@superset/ui/card";

interface AgentCardActionsProps {
	isDirty: boolean;
	isUpdating: boolean;
	isResetting: boolean;
	onSave: () => void;
	onReset: () => void;
}

export function AgentCardActions({
	isDirty,
	isUpdating,
	isResetting,
	onSave,
	onReset,
}: AgentCardActionsProps) {
	return (
		<CardFooter className="justify-end gap-2">
			<Button variant="outline" onClick={onReset} disabled={isResetting}>
				Reset to Defaults
			</Button>
			<Button onClick={onSave} disabled={!isDirty || isUpdating}>
				Save
			</Button>
		</CardFooter>
	);
}
