import Link from "next/link";
import { templateRegistry } from "@/templates/registry";

export default async function PreviewListPage() {
  const templateIds = Object.keys(templateRegistry);
  const templates = await Promise.all(
    templateIds.map(async (id) => {
      const mod = await templateRegistry[id]!();
      return { ...mod.metadata, id };
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-bold">Landing Templates</h1>
      <p className="mt-2 text-muted-foreground">
        Preview all available templates. Set <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">LANDING_TEMPLATE</code> in your <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono">.env.local</code> to select one.
      </p>

      <div className="mt-10 grid gap-4">
        {templates.map((t) => (
          <Link
            key={t.id}
            href={`/preview/${t.id}`}
            className="flex items-center justify-between rounded-xl border border-border/40 p-6 transition-colors hover:border-border hover:bg-muted/30"
          >
            <div>
              <h2 className="font-semibold">{t.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
            </div>
            <span className="rounded-md bg-muted px-3 py-1 font-mono text-sm">{t.id}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
