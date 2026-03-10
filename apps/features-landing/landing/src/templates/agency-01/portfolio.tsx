import { Section } from "@/components/section";

const projects = [
  { title: "E-commerce Platform", category: "Development", color: "bg-muted/30" },
  { title: "Brand Identity", category: "Design", color: "bg-muted/40" },
  { title: "Mobile App", category: "Development", color: "bg-muted/50" },
  { title: "Marketing Campaign", category: "Marketing", color: "bg-muted/60" },
];

export function Portfolio() {
  return (
    <Section id="portfolio">
      <div className="mb-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Our Work
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">Selected projects</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {projects.map((project) => (
          <div
            key={project.title}
            className={`group flex aspect-[4/3] cursor-pointer flex-col justify-end rounded-xl p-8 transition-colors hover:bg-muted/70 ${project.color}`}
          >
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {project.category}
            </p>
            <h3 className="mt-1 text-xl font-semibold">{project.title}</h3>
          </div>
        ))}
      </div>
    </Section>
  );
}
