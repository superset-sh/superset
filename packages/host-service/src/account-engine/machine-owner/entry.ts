import { startMachineAccountOwner } from "./owner.ts";

startMachineAccountOwner()
	.then((close) => {
		if (!close) return;
		for (const signal of ["SIGTERM", "SIGINT"] as const)
			process.once(signal, () => {
				void close();
			});
	})
	.catch((error) => {
		console.error("[account-owner] startup failed", error);
		process.exitCode = 1;
	});
