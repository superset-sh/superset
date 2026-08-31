import { LuTriangleAlert } from "react-icons/lu";

/**
 * Facts about the outside world that stop a valid-looking trigger from firing
 * — a Slack channel the bot is not in, a "Me" filter with no account behind it.
 *
 * Not problems: the config is fine and saves, so these are standing statements
 * rather than anything blocking, and they show without waiting for a save
 * attempt. The person who can fix one is often not the person editing.
 */
export function RuntimeWarnings({ warnings }: { warnings: string[] }) {
	if (warnings.length === 0) return null;
	return (
		<div className="flex flex-col gap-2 px-1 py-6">
			{warnings.map((warning) => (
				<p
					key={warning}
					// select-text: the renderer body sets user-select: none, and a
					// warning naming a channel is something people copy out.
					className="flex cursor-text select-text items-start gap-1.5 text-[13px] text-amber-600 dark:text-amber-400"
				>
					<LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
					<span>{warning}</span>
				</p>
			))}
		</div>
	);
}
