import { tryProxyLock } from "../registry";

const release = tryProxyLock("a".repeat(64));
if (!release) throw new Error("Lock unavailable");
process.stdout.write("locked\n");
setInterval(() => {}, 1000);
