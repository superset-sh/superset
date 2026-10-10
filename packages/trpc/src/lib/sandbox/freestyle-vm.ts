import type { Vm } from "freestyle";

export async function coldStop(vm: Vm): Promise<void> {
	if ((await vm.data()).state === "stopped") return;
	await vm.start();
	// The guest agent can disconnect before delivering poweroff's reply.
	await vm
		.linuxUser("root")
		.exec("systemctl poweroff")
		.catch(() => undefined);
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if ((await vm.data()).state === "stopped") return;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`VM ${vm.id} did not power off`);
}

export async function rootExec(vm: Vm, command: string): Promise<void> {
	const result = await vm
		.linuxUser("root")
		.exec({ command, timeoutMs: 300_000 });
	if (result.statusCode !== 0) {
		throw new Error(
			`VM command failed (${result.statusCode}): ${result.stderr ?? ""}`,
		);
	}
}
