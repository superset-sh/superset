"use client";

import { Mail, MapPin } from "lucide-react";
import { Section } from "@/components/section";

export function Contact() {
  return (
    <Section id="contact">
      <div className="grid gap-12 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Contact
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">
            Let&apos;s work together
          </h2>
          <p className="mt-4 text-muted-foreground">
            Have a project in mind? We&apos;d love to hear about it.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="size-4 text-muted-foreground" />
              <span>hello@agency.com</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="size-4 text-muted-foreground" />
              <span>Seoul, South Korea</span>
            </div>
          </div>
        </div>

        {/* TODO: 프로덕션 배포 전 Formspree/Netlify Forms 등 실제 폼 서비스 연결 필요 */}
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Name</label>
            <input
              id="name"
              type="text"
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Your name"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium">Message</label>
            <textarea
              id="message"
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              placeholder="Tell us about your project..."
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Send Message
          </button>
        </form>
      </div>
    </Section>
  );
}
