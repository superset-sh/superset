import { MessageScroller } from "@shadcn/react/message-scroller";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowDownIcon } from "lucide-react";
import {
	ChatHistorySidebar,
	type ChatHistorySidebarMessage,
} from "./ChatHistorySidebar";
import { ChatHistorySidebarScroller } from "./ChatHistorySidebarScroller";

const EXCHANGES: Array<[string, string]> = [
	[
		"Can you enrich the leads spreadsheet with company data from Exa?",
		"Sure — I'll read the sheet, look up each domain through the Exa API, and write the enriched columns back. Starting with a dry run on the first 20 rows.",
	],
	[
		"How many rows are in the sheet total?",
		"The live tab has 665 data rows (47:665 after the header block). 512 have a website domain we can enrich against.",
	],
	[
		"OH omg are you processing the full list, that's going to blow the quota",
		"No, I was not processing the full list. Every read/write has targeted the tab gems hidden here (sheetId=1349233779). The sheet metadata also confirms only 50 rows were touched.",
	],
	[
		"Ok good. What did the dry run find?",
		"Of the 50 sampled rows: 41 matched an Exa result with high confidence, 6 matched with low confidence, and 3 had dead domains. No API errors.",
	],
	[
		"What does a low-confidence match look like?",
		"Mostly holding companies or renamed brands — the domain resolves but the Exa summary describes a different entity. I flagged those in a new column instead of overwriting.",
	],
	[
		"Run the whole list but skip anything already enriched",
		"Running now with a 4-way concurrency limit and checkpointing every 25 rows. Already-enriched rows are detected by a non-empty `exa_summary` cell and skipped.",
	],
	[
		"How's it going?",
		"318 of 512 rows processed. 12 rate-limit retries so far, all recovered. ETA about 6 minutes at the current pace.",
	],
	[
		"Did any rows fail?",
		"Three rows failed twice on timeouts. I queued them for a final retry pass at the end rather than blocking the main sweep.",
	],
	[
		"Show me the final counts",
		"Done. 462 rows enriched, 50 rows marked `Exa no match`, 0 Exa errors, 0 `Not started` rows remain. Updated only columns V:AC and AG; left AD:AF untouched.",
	],
	[
		"Where's the backup before the write?",
		"I exported the pre-write state to /tmp/superset_exa_enrichment_2026_08.csv and also duplicated the tab as `leads_backup_0804` inside the workbook.",
	],
	[
		"Can you dedupe companies that appear twice?",
		"Found 14 duplicate domains. I kept the row with the most filled columns and marked the others with `duplicate_of` pointing at the surviving row id.",
	],
	[
		"Add a column scoring fit against our ICP",
		"Added `icp_score` (0-100) computed from headcount band, industry match, and tooling signals in the Exa summary. Median score is 61; 88 companies score above 80.",
	],
	[
		"Which 5 companies score highest?",
		"Top five: Datafold (97), Brightwave (94), Kestrel Labs (93), Northbeam (91), and Parcelio (90). All are 50-200 headcount B2B SaaS with engineering-led buying.",
	],
	[
		"Export the 80+ segment for the outbound tool",
		"Exported 88 rows to `outbound_batch_aug.csv` with the column mapping your outreach tool expects (first_name, company, domain, icp_score, personalization_hook).",
	],
	[
		"Write me a one-paragraph summary for the team",
		"Enriched 512 lead rows via Exa with zero API errors: 462 matched, 50 unmatched, 14 duplicates collapsed. New `icp_score` column ranks fit; 88 companies clear the 80+ bar and are exported for outbound. Backups live in the workbook and /tmp before any write.",
	],
];

let idCounter = 0;
function toMessages(
	exchanges: Array<[string, string]>,
): ChatHistorySidebarMessage[] {
	return exchanges.flatMap(([user, assistant]) => [
		{ id: `m${idCounter++}`, role: "user" as const, preview: user },
		{ id: `m${idCounter++}`, role: "assistant" as const, preview: assistant },
	]);
}

const messages = toMessages(EXCHANGES);
const manyMessages = toMessages([
	...EXCHANGES,
	...EXCHANGES,
	...EXCHANGES,
	...EXCHANGES,
]);
const fewMessages = toMessages(EXCHANGES.slice(0, 5));
const belowMinimum = toMessages(EXCHANGES.slice(0, 3));

const meta = {
	component: ChatHistorySidebar,
	parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ChatHistorySidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

function ChatDemo({
	sidebarMessages,
}: {
	sidebarMessages: ChatHistorySidebarMessage[];
}) {
	return (
		<div className="flex h-screen bg-background text-foreground">
			<MessageScroller.Provider defaultScrollPosition="start">
				<div className="flex w-16 shrink-0 items-center pl-3">
					<ChatHistorySidebarScroller messages={sidebarMessages} />
				</div>
				<MessageScroller.Root className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
					<MessageScroller.Viewport className="flex flex-1 flex-col overflow-y-auto">
						<MessageScroller.Content className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
							{sidebarMessages.map((message) => (
								<MessageScroller.Item
									key={message.id}
									messageId={message.id}
									scrollAnchor={message.role === "user"}
									className={
										message.role === "user"
											? "ml-auto max-w-[80%] rounded-2xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground"
											: "text-sm leading-relaxed text-foreground/90"
									}
								>
									{message.preview}
								</MessageScroller.Item>
							))}
						</MessageScroller.Content>
					</MessageScroller.Viewport>
					<MessageScroller.Button
						direction="end"
						behavior="smooth"
						aria-label="Scroll to bottom"
						className="absolute bottom-4 left-1/2 z-10 flex size-9 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur transition-[opacity,scale,color] duration-150 hover:text-foreground data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0"
					>
						<ArrowDownIcon className="size-4.5" />
					</MessageScroller.Button>
				</MessageScroller.Root>
			</MessageScroller.Provider>
		</div>
	);
}

export const Default: Story = {
	args: { messages },
	render: (args) => <ChatDemo sidebarMessages={args.messages} />,
};

export const ManyMessages: Story = {
	args: { messages: manyMessages },
	render: (args) => <ChatDemo sidebarMessages={args.messages} />,
};

export const FewMessages: Story = {
	args: { messages: fewMessages },
	render: (args) => <ChatDemo sidebarMessages={args.messages} />,
};

const userMessageIds = messages
	.filter((message) => message.role === "user")
	.map((message) => message.id);

export const SidebarOnly: Story = {
	args: { messages, activeMessageIds: userMessageIds.slice(5, 9) },
	render: (args) => (
		<div className="flex h-screen items-center bg-background pl-3">
			<ChatHistorySidebar {...args} />
		</div>
	),
};

export const HiddenBelowFourMessages: Story = {
	args: { messages: belowMinimum },
	render: (args) => <ChatDemo sidebarMessages={args.messages} />,
};
