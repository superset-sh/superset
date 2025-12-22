import { observable } from "@trpc/server/observable";
import { type DetectedPort, portManager } from "main/lib/terminal/port-manager";
import { publicProcedure, router } from "../..";

type PortEvent =
	| { type: "add"; port: DetectedPort }
	| { type: "remove"; port: DetectedPort };

export const createPortsRouter = () => {
	return router({
		// Get all currently detected ports
		getAll: publicProcedure.query(() => {
			return portManager.getAllPorts();
		}),

		// Subscribe to port changes (add/remove events)
		subscribe: publicProcedure.subscription(() => {
			return observable<PortEvent>((emit) => {
				const onAdd = (port: DetectedPort) => {
					emit.next({ type: "add", port });
				};

				const onRemove = (port: DetectedPort) => {
					emit.next({ type: "remove", port });
				};

				portManager.on("port:add", onAdd);
				portManager.on("port:remove", onRemove);

				return () => {
					portManager.off("port:add", onAdd);
					portManager.off("port:remove", onRemove);
				};
			});
		}),
	});
};
