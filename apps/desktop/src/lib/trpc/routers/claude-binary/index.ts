import { observable } from "@trpc/server/observable";
import {
	type ClaudeBinaryStatusEvent,
	claudeBinaryEmitter,
	ensureClaudeBinary,
	getBinaryStatus,
} from "main/lib/claude-binary-manager";
import { publicProcedure, router } from "../..";

export const createClaudeBinaryRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<ClaudeBinaryStatusEvent>((emit) => {
				emit.next(getBinaryStatus());

				const onStatusChanged = (event: ClaudeBinaryStatusEvent) => {
					emit.next(event);
				};

				claudeBinaryEmitter.on("status-changed", onStatusChanged);

				return () => {
					claudeBinaryEmitter.off("status-changed", onStatusChanged);
				};
			});
		}),

		getStatus: publicProcedure.query(() => {
			return getBinaryStatus();
		}),

		ensureReady: publicProcedure.mutation(async () => {
			await ensureClaudeBinary();
		}),
	});
};
