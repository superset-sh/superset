import { templateRegistry, getTemplateId } from "@/templates/registry";

export default async function HomePage() {
  const templateId = getTemplateId();
  const loader = templateRegistry[templateId];

  if (!loader) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          Template &quot;{templateId}&quot; not found.
          Available: {Object.keys(templateRegistry).join(", ")}
        </p>
      </div>
    );
  }

  const { default: Template } = await loader();
  return <Template />;
}
