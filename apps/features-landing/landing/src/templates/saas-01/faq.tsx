"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "What is Feature Atlas?",
    answer:
      "Feature Atlas is a modular SaaS boilerplate built with NestJS, React, and Drizzle ORM. It provides 17+ production-ready features that you can mix and match to build your SaaS product.",
  },
  {
    question: "Do I need to use all features?",
    answer:
      "No. Each feature is independent and self-contained. You can pick only the features you need. The modular architecture ensures unused features don't add bloat to your application.",
  },
  {
    question: "What payment providers are supported?",
    answer:
      "Feature Atlas integrates with LemonSqueezy out of the box, supporting subscriptions, one-time payments, license keys, and a credit-based billing system for AI features.",
  },
  {
    question: "Can I deploy anywhere?",
    answer:
      "Yes. The frontend deploys to Vercel, Netlify, or any static host. The backend runs on any Node.js environment — Railway, Fly.io, AWS, or your own servers.",
  },
  {
    question: "Is there a free tier?",
    answer:
      "Yes, Feature Atlas offers a generous free tier that includes up to 3 features, perfect for side projects and prototyping.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Section id="faq">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Frequently asked questions
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Everything you need to know about Feature Atlas.
        </p>
      </div>

      <div className="mx-auto mt-16 max-w-2xl divide-y divide-border/40">
        {faqs.map((faq, index) => (
          <div key={faq.question} className="py-4">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              aria-expanded={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
            >
              <span className="text-sm font-medium">{faq.question}</span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  openIndex === index && "rotate-180",
                )}
              />
            </button>
            {openIndex === index && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {faq.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
