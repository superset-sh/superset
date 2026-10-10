import type { ChatTransport } from "../sessionClient";

type Mutation =
	| "createSession"
	| "prompt"
	| "removeQueuedPrompt"
	| "steerQueuedPrompt"
	| "resumeQueue"
	| "cancelTurn"
	| "stopBackgroundTask"
	| "respondToApproval"
	| "setMode"
	| "setConfigOption"
	| "closeSession"
	| "forkSession";

type Query =
	| "getSession"
	| "getQueue"
	| "listSessions"
	| "getItems"
	| "getOutline"
	| "getItemBodies";

/** A tRPC client for the chat router, by shape rather than by router type. */
export type ChatTrpcClient = {
	[K in Mutation]: { mutate: ChatTransport[K] };
} & {
	[K in Query]: { query: ChatTransport[K] };
};

/** Each app builds its own client (auth, links); the mapping is the same. */
export function chatTransportFromTrpc(client: ChatTrpcClient): ChatTransport {
	return {
		createSession: (input) => client.createSession.mutate(input),
		prompt: (input) => client.prompt.mutate(input),
		removeQueuedPrompt: (input) => client.removeQueuedPrompt.mutate(input),
		steerQueuedPrompt: (input) => client.steerQueuedPrompt.mutate(input),
		resumeQueue: (input) => client.resumeQueue.mutate(input),
		cancelTurn: (input) => client.cancelTurn.mutate(input),
		stopBackgroundTask: (input) => client.stopBackgroundTask.mutate(input),
		respondToApproval: (input) => client.respondToApproval.mutate(input),
		setMode: (input) => client.setMode.mutate(input),
		setConfigOption: (input) => client.setConfigOption.mutate(input),
		closeSession: (input) => client.closeSession.mutate(input),
		forkSession: (input) => client.forkSession.mutate(input),
		getSession: (input) => client.getSession.query(input),
		getQueue: (input) => client.getQueue.query(input),
		listSessions: (input) => client.listSessions.query(input),
		getItems: (input) => client.getItems.query(input),
		getOutline: (input) => client.getOutline.query(input),
		getItemBodies: (input) => client.getItemBodies.query(input),
	};
}
