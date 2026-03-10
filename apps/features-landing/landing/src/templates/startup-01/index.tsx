import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Hero } from "./hero";
import { ProblemSolution } from "./problem-solution";
import { HowItWorks } from "./how-it-works";
import { Stats } from "./stats";
import { CTA } from "./cta";
import type { TemplateMetadata } from "../registry";

export const metadata: TemplateMetadata = {
  id: "startup-01",
  name: "Startup Bold",
  description: "Bold startup landing with dark hero, problem/solution, and strong CTAs.",
};

const navItems = [
  { label: "How it Works", href: "#how-it-works" },
  { label: "GitHub", href: "https://github.com/feature-atlas" },
];

export default function Startup01Template() {
  return (
    <>
      <Navbar items={navItems} />
      <main>
        <Hero />
        <ProblemSolution />
        <HowItWorks />
        <Stats />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
