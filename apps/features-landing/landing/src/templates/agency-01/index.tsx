import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Hero } from "./hero";
import { Services } from "./services";
import { Portfolio } from "./portfolio";
import { Team } from "./team";
import { Contact } from "./contact";
import type { TemplateMetadata } from "../registry";

export const metadata: TemplateMetadata = {
  id: "agency-01",
  name: "Agency Portfolio",
  description: "Agency/portfolio landing with split hero, services, case studies, team, and contact form.",
};

const navItems = [
  { label: "Services", href: "#services" },
  { label: "Work", href: "#portfolio" },
  { label: "Contact", href: "#contact" },
];

export default function Agency01Template() {
  return (
    <>
      <Navbar items={navItems} />
      <main>
        <Hero />
        <Services />
        <Portfolio />
        <Team />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
