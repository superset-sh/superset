import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("latest locale selection wins cold imports and rapid mixed activation", async () => {
	const source = `
 import { i18n, initI18n, initI18nAsync, loadLocale } from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))};
 initI18n('pl');
 initI18n('en');
 await loadLocale('pl');
 if (i18n.locale !== 'en') throw new Error('Cold import overrode English');
 const pending = initI18nAsync('ja');
 initI18n('fr');
 await pending;
 await loadLocale('fr');
 if (i18n.locale !== 'fr') throw new Error('Mixed activation lost the latest choice');
 for (let i = 0; i < 100; i++) {
  const pending = [initI18nAsync('pl'), initI18nAsync('ja'), initI18nAsync('zh-CN'), initI18nAsync('zh-TW')];
  initI18n('en');
  await Promise.all(pending);
  if (i18n.locale !== 'en') throw new Error('Rapid switching lost English');
 }
 `;
	const process = Bun.spawn([processExec(), "-e", source], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([
		process.exited,
		new Response(process.stderr).text(),
	]);
	expect(stderr).toBe("");
	expect(code).toBe(0);
});

function processExec() {
	return process.execPath;
}
