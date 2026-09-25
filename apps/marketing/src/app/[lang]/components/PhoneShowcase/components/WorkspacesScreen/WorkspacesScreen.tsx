import {
	HiMiniChevronDown,
	HiMiniChevronUpDown,
	HiMiniMagnifyingGlass,
	HiMiniMicrophone,
	HiMiniPlus,
} from "react-icons/hi2";
import { LuFolderGit2 } from "react-icons/lu";

interface WorkspaceRow {
	title: string;
	meta?: string;
	isRunning?: boolean;
}

const PROJECTS: readonly { name: string; rows: readonly WorkspaceRow[] }[] = [
	{
		name: "acme",
		rows: [
			{
				title: "Fix input overflow handling",
				meta: "fix-input-overflow · +26 −2",
				isRunning: true,
			},
			{ title: "main" },
			{ title: "Tidy up empty states", meta: "tidy-empty-states · +10 −0" },
			{ title: "Update icon size", meta: "update-icon-size · +1 −0" },
		],
	},
	{
		name: "acme-ios",
		rows: [
			{
				title: "Add transcription demo",
				meta: "add-transcription-demo · +14 −0",
			},
			{ title: "Add haptics to buttons", meta: "add-button-haptics · +19 −0" },
		],
	},
];

const CHIP_CLASS =
	"flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[9px] text-white/80";

export function WorkspacesScreen() {
	return (
		<div className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 font-semibold text-[13px]">
					<span className="flex size-[18px] items-center justify-center rounded-[5px] bg-white/10 text-[8px] text-white/70">
						A
					</span>
					Acme
					<HiMiniChevronUpDown className="size-3 text-white/50" />
				</span>
				<span className="flex size-7 items-center justify-center rounded-full bg-white/10">
					<HiMiniMagnifyingGlass className="size-3.5" />
				</span>
			</div>

			<div className="mt-3 flex gap-1.5">
				<span className={CHIP_CLASS}>
					<span className="size-1.5 rounded-full bg-emerald-400" />
					acme-devbox
					<HiMiniChevronDown className="size-2.5 text-white/50" />
				</span>
				<span className={CHIP_CLASS}>
					Last updated
					<HiMiniChevronDown className="size-2.5 text-white/50" />
				</span>
			</div>

			<div className="mt-4 space-y-4">
				{PROJECTS.map((project) => (
					<div key={project.name}>
						<div className="flex items-center justify-between">
							<span className="flex items-center gap-1.5 font-semibold text-[12px]">
								<HiMiniChevronDown className="size-3 text-white/50" />
								{project.name}
								<span className="font-normal text-[10px] text-white/40">
									{project.rows.length}
								</span>
							</span>
							<HiMiniPlus className="size-3.5 text-white/50" />
						</div>
						<div className="mt-2 space-y-2.5 pl-4">
							{project.rows.map((row) => (
								<div key={row.title} className="flex items-center gap-2">
									<LuFolderGit2 className="size-3 shrink-0 text-white/40" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-[11px]">
											{row.title}
										</span>
										{row.meta ? (
											<span className="block truncate text-[8.5px] text-white/45">
												{row.meta}
											</span>
										) : null}
									</span>
									{row.isRunning ? (
										<span className="relative flex size-2 shrink-0">
											<span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
											<span className="relative inline-flex size-2 rounded-full bg-brand" />
										</span>
									) : null}
								</div>
							))}
						</div>
					</div>
				))}
			</div>

			<div className="mt-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5">
				<span className="flex size-5 items-center justify-center rounded-full bg-white/10">
					<HiMiniPlus className="size-3" />
				</span>
				<span className="flex-1 text-[10px] text-white/45">
					Plan, ask, build…
				</span>
				<HiMiniMicrophone className="size-3 text-white/50" />
			</div>
		</div>
	);
}
