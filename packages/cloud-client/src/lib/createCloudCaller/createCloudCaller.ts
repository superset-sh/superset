import type {
	CloudCaller,
	CreateThreadArgs,
	DeleteArgs,
	EditArgs,
	ListArgs,
	ReplyArgs,
	ResolveArgs,
	ServerComment,
	ServerThread,
} from "../../types";

interface PageCommentProcedures {
	list: { query: (input: ListArgs) => Promise<ServerThread[]> };
	create: { mutate: (input: CreateThreadArgs) => Promise<ServerThread> };
	reply: { mutate: (input: ReplyArgs) => Promise<ServerComment> };
	edit: { mutate: (input: EditArgs) => Promise<unknown> };
	resolve: { mutate: (input: ResolveArgs) => Promise<unknown> };
	delete: { mutate: (input: DeleteArgs) => Promise<unknown> };
}

export interface CloudTrpcClient {
	pageComment: PageCommentProcedures;
}

export function createCloudCaller(client: CloudTrpcClient): CloudCaller {
	return {
		pageComment: {
			list: (input) => client.pageComment.list.query(input),
			create: (input) => client.pageComment.create.mutate(input),
			reply: (input) => client.pageComment.reply.mutate(input),
			edit: (input) => client.pageComment.edit.mutate(input),
			resolve: (input) => client.pageComment.resolve.mutate(input),
			delete: (input) => client.pageComment.delete.mutate(input),
		},
	};
}
