import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

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
		<span
			aria-hidden="true"
			className={cn(
				"text-base font-mono select-none text-amber-500",
				className,
			)}
		>
			{FRAMES[frame]}
		</span>
	);
}
