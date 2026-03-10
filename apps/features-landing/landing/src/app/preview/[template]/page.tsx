import { notFound } from "next/navigation";
import { templateRegistry, getTemplateIds } from "@/templates/registry";

interface Props {
  params: Promise<{ template: string }>;
}

export async function generateStaticParams() {
  return getTemplateIds().map((template) => ({ template }));
}

export default async function PreviewPage({ params }: Props) {
  const { template } = await params;
  const loader = templateRegistry[template];

  if (!loader) {
    notFound();
  }

  const { default: Template } = await loader();

  return (
    <div>
      <div className="sticky top-0 z-50 flex items-center justify-between bg-foreground px-6 py-2 text-sm text-background">
        <span>
          Preview: <strong>{template}</strong>
        </span>
        <a href="/preview" className="underline underline-offset-4 hover:no-underline">
          All Templates
        </a>
      </div>

      <Template />
    </div>
  );
}
