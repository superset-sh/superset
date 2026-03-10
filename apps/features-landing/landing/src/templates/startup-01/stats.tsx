import { Section } from "@/components/section";

const stats = [
  { value: "17+", label: "Pre-built Features" },
  { value: "500+", label: "Developers" },
  { value: "< 2 weeks", label: "Average Launch Time" },
  { value: "MIT", label: "Licensed" },
];

export function Stats() {
  return (
    <Section>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-3xl font-bold md:text-4xl">{stat.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
