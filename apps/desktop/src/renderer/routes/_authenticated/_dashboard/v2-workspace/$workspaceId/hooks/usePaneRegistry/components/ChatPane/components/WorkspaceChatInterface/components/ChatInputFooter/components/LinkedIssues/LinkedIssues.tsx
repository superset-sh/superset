import { AnimatePresence, motion } from "framer-motion";
import type { LinkedIssue } from "../../types";
import { LinkedIssuePill } from "../LinkedIssuePill";

interface LinkedIssuesProps {
	issues: LinkedIssue[];
	onRemove: (slug: string) => void;
}

export function LinkedIssues({ issues, onRemove }: LinkedIssuesProps) {
	if (issues.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-2 p-3 w-full">
			<AnimatePresence initial={false}>
				{issues.map((issue) => (
					<motion.div
						key={issue.slug}
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						transition={{ duration: 0.15 }}
					>
						<LinkedIssuePill
							slug={issue.slug}
							title={issue.title}
							url={issue.url}
							taskId={issue.taskId}
							onRemove={() => onRemove(issue.slug)}
						/>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
