import type { RouterInputs, RouterOutputs } from "@superset/trpc";

export type ServerThread = RouterOutputs["pageComment"]["list"][number];
export type ServerComment = ServerThread["comments"][number];

export type ListArgs = RouterInputs["pageComment"]["list"];
export type CreateThreadArgs = RouterInputs["pageComment"]["create"];
export type ReplyArgs = RouterInputs["pageComment"]["reply"];
export type EditArgs = RouterInputs["pageComment"]["edit"];
export type ResolveArgs = RouterInputs["pageComment"]["resolve"];
export type DeleteArgs = RouterInputs["pageComment"]["delete"];

export interface PageCommentCaller {
	list(input: ListArgs): Promise<ServerThread[]>;
	create(input: CreateThreadArgs): Promise<ServerThread>;
	reply(input: ReplyArgs): Promise<ServerComment>;
	edit(input: EditArgs): Promise<unknown>;
	resolve(input: ResolveArgs): Promise<unknown>;
	delete(input: DeleteArgs): Promise<unknown>;
}

export interface CloudCaller {
	pageComment: PageCommentCaller;
}
