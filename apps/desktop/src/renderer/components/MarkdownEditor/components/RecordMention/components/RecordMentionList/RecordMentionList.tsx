import { Trans } from "@lingui/react/macro";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { cn } from "@superset/ui/utils";
import type {
	SuggestionKeyDownProps,
	SuggestionProps,
} from "@tiptap/suggestion";
import {
	forwardRef,
	type ReactNode,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { LuGitPullRequest } from "react-icons/lu";
import { useTaskDisplayId } from "renderer/hooks/useTaskDisplayId";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import type { RecordMentionItem } from "../../types";

export interface RecordMentionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const GROUPS: { kind: RecordMentionItem["kind"]; title: ReactNode }[] = [
	{ kind: "person", title: <Trans>People</Trans> },
	{ kind: "task", title: <Trans>Tasks</Trans> },
	{ kind: "pull_request", title: <Trans>Pull requests</Trans> },
];

function MentionRow({ item }: { item: RecordMentionItem }) {
	const taskDisplayId = useTaskDisplayId();
	switch (item.kind) {
		case "person":
			return (
				<>
					<AvatarStack
						people={[{ id: item.id, name: item.name, image: item.image }]}
						size={20}
					/>
					<span className="truncate">{item.name}</span>
				</>
			);
		case "task":
			return (
				<>
					<span className="flex size-5 shrink-0 items-center justify-center">
						<StatusIcon
							type={item.status.type as StatusType}
							color={item.status.color}
							progress={item.status.progressPercent ?? undefined}
						/>
					</span>
					<span className="shrink-0 font-mono text-muted-foreground">
						{taskDisplayId(item)}
					</span>
					<span className="truncate">{item.title}</span>
				</>
			);
		case "pull_request":
			return (
				<>
					<span className="flex size-5 shrink-0 items-center justify-center">
						<LuGitPullRequest className="size-4 text-muted-foreground" />
					</span>
					<span className="shrink-0 text-muted-foreground">#{item.number}</span>
					<span className="truncate">{item.title}</span>
				</>
			);
	}
}

export const RecordMentionList = forwardRef<
	RecordMentionListRef,
	SuggestionProps<RecordMentionItem>
>(({ items, command }, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new items
	useEffect(() => {
		setSelectedIndex(0);
	}, [items]);

	useEffect(() => {
		containerRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: SuggestionKeyDownProps) => {
			if (items.length === 0) return false;
			if (event.key === "ArrowUp") {
				setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((prev) => (prev + 1) % items.length);
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				const item = items[selectedIndex];
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));

	if (items.length === 0) {
		return (
			<div className="rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
				<div className="px-2 py-1.5 text-xs text-muted-foreground">
					<Trans>No matches</Trans>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="max-h-96 w-[26rem] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{GROUPS.map((group) => {
				const rows = items.flatMap((item, index) =>
					item.kind === group.kind ? [{ item, index }] : [],
				);
				if (rows.length === 0) return null;
				return (
					<div
						key={group.kind}
						className="border-border not-first:mt-1 not-first:border-t not-first:pt-1"
					>
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							{group.title}
						</div>
						{rows.map(({ item, index }) => (
							<button
								type="button"
								key={`${item.kind}:${item.id}`}
								data-index={index}
								onMouseEnter={() => setSelectedIndex(index)}
								onClick={() => command(item)}
								className={cn(
									"flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none",
									index === selectedIndex && "bg-accent text-accent-foreground",
								)}
							>
								<MentionRow item={item} />
							</button>
						))}
					</div>
				);
			})}
		</div>
	);
});

RecordMentionList.displayName = "RecordMentionList";
