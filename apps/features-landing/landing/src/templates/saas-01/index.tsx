import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Hero } from "./hero";
import { Features } from "./features";
import { Pricing } from "./pricing";
import { Testimonials } from "./testimonials";
import { FAQ } from "./faq";
import type { TemplateMetadata } from "../registry";

export const metadata: TemplateMetadata = {
  id: "saas-01",
  name: "SaaS Classic",
  description: "Clean SaaS landing with hero, features grid, pricing, testimonials, and FAQ.",
};

export default function SaaS01Template() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Pricing />
        <Testimonials />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
