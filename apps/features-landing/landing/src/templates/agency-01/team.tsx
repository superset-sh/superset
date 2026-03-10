import { Section } from "@/components/section";

const team = [
  { name: "Alex Kim", role: "CEO & Strategy" },
  { name: "Mina Park", role: "Lead Designer" },
  { name: "Chris Lee", role: "CTO" },
  { name: "Dana Choi", role: "Growth Lead" },
];

export function Team() {
  return (
    <Section variant="muted">
      <div className="mb-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Our Team
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">Meet the crew</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {team.map((member) => (
          <div key={member.name} className="text-center">
            <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-muted">
              <span className="text-2xl font-bold text-muted-foreground">
                {member.name.charAt(0)}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold">{member.name}</h3>
            <p className="text-sm text-muted-foreground">{member.role}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
