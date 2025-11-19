import { Button } from "@superset/ui/button";
import { useTabsStore } from "renderer/stores/tabs";

export function AddTabButton() {
	const { addTab } = useTabsStore();

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={addTab}
			aria-label="Add new tab"
			className="mt-2"
		>
			<span className="text-lg">+</span>
		</Button>
	);
}
