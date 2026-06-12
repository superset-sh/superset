import { useEffect, useState } from "react";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL = 80;

export function BrailleSpinner({ className }: { className?: string }) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const id = setInterval(
			() => setFrame((f) => (f + 1) % FRAMES.length),
			INTERVAL,
		);
		return () => clearInterval(id);
	}, []);

	return (
		<Text
			aria-hidden
			className={cn("font-mono text-amber-500 text-base", className)}
		>
			{FRAMES[frame]}
		</Text>
	);
}
