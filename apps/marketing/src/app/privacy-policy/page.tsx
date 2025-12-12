import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

export const metadata: Metadata = {
	title: "Privacy Policy - Superset",
	description:
		"Learn how Superset collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
	return (
		<>
			<Header />
			<main className="bg-neutral-900 pt-24 pb-16 min-h-screen">
				<article className="max-w-3xl mx-auto px-6 sm:px-8">
					<header className="border-b border-neutral-800 pb-8 mb-10">
						<h1 className="text-3xl sm:text-4xl font-medium text-neutral-100">
							Privacy Policy
						</h1>
						<p className="mt-4 text-sm text-neutral-500">
							Last updated: December 11, 2025
						</p>
					</header>

					<div className="space-y-10 text-neutral-300 leading-relaxed">
						{/* Introduction */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								1. Introduction
							</h2>
							<p>
								Superset (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
								respects your privacy and is committed to protecting your
								personal data. This Privacy Policy explains how we collect, use,
								disclose, and safeguard your information when you visit our
								website or use our desktop application.
							</p>
							<p>
								Please read this policy carefully. If you do not agree with the
								terms of this Privacy Policy, please do not access our services.
							</p>
						</section>

						{/* Information We Collect */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								2. Information We Collect
							</h2>

							<div className="space-y-3">
								<h3 className="text-lg font-medium text-neutral-200">
									2.1 Information You Provide
								</h3>
								<ul className="list-disc pl-6 space-y-2">
									<li>
										<strong className="text-neutral-100">Account Data:</strong>{" "}
										When you sign up for our waitlist or create an account, we
										may collect your name, email address, and other contact
										information.
									</li>
									<li>
										<strong className="text-neutral-100">
											Communications:
										</strong>{" "}
										When you contact us for support or feedback, we collect the
										information you provide in those communications.
									</li>
									<li>
										<strong className="text-neutral-100">Payment Data:</strong>{" "}
										If you make a purchase, payment information is processed by
										our third-party payment processors. We do not store your
										full payment card details.
									</li>
								</ul>
							</div>

							<div className="space-y-3">
								<h3 className="text-lg font-medium text-neutral-200">
									2.2 Automatically Collected Information
								</h3>
								<ul className="list-disc pl-6 space-y-2">
									<li>
										<strong className="text-neutral-100">Usage Data:</strong> We
										collect information about how you interact with our
										services, including pages visited, features used, and time
										spent.
									</li>
									<li>
										<strong className="text-neutral-100">Device Data:</strong>{" "}
										We may collect device identifiers, operating system version,
										browser type, and similar technical information.
									</li>
									<li>
										<strong className="text-neutral-100">Log Data:</strong> Our
										servers automatically record information such as IP address,
										access times, and referring URLs.
									</li>
								</ul>
							</div>

							<div className="space-y-3">
								<h3 className="text-lg font-medium text-neutral-200">
									2.3 Desktop Application
								</h3>
								<p>
									Our desktop application runs locally on your machine. We do
									not have access to your source code, terminal commands, or
									file contents unless you explicitly choose to share diagnostic
									information with us.
								</p>
							</div>
						</section>

						{/* How We Use Information */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								3. How We Use Your Information
							</h2>
							<p>We use the information we collect to:</p>
							<ul className="list-disc pl-6 space-y-2">
								<li>Provide, operate, and maintain our services</li>
								<li>Process transactions and send related information</li>
								<li>
									Send you technical notices, updates, security alerts, and
									support messages
								</li>
								<li>
									Respond to your comments, questions, and customer service
									requests
								</li>
								<li>
									Analyze usage patterns to improve our products and user
									experience
								</li>
								<li>
									Detect, prevent, and address technical issues and security
									threats
								</li>
								<li>Comply with legal obligations</li>
							</ul>
						</section>

						{/* Sharing */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								4. Sharing of Information
							</h2>
							<p>
								We do not sell your personal information. We may share your
								information in the following circumstances:
							</p>
							<ul className="list-disc pl-6 space-y-2">
								<li>
									<strong className="text-neutral-100">
										Service Providers:
									</strong>{" "}
									With third-party vendors who perform services on our behalf
									(e.g., hosting, analytics, payment processing).
								</li>
								<li>
									<strong className="text-neutral-100">
										Legal Compliance:
									</strong>{" "}
									When required by law, regulation, or legal process.
								</li>
								<li>
									<strong className="text-neutral-100">
										Protection of Rights:
									</strong>{" "}
									To protect our rights, privacy, safety, or property, or that
									of our users or the public.
								</li>
								<li>
									<strong className="text-neutral-100">
										Business Transfers:
									</strong>{" "}
									In connection with a merger, acquisition, or sale of assets.
								</li>
							</ul>
						</section>

						{/* Data Retention */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								5. Data Retention
							</h2>
							<p>
								We retain your personal information for as long as necessary to
								fulfill the purposes for which it was collected, comply with our
								legal obligations, resolve disputes, and enforce our agreements.
								When data is no longer needed, we securely delete or anonymize
								it.
							</p>
						</section>

						{/* Security */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								6. Data Security
							</h2>
							<p>
								We implement appropriate technical and organizational measures
								to protect your personal information against unauthorized
								access, alteration, disclosure, or destruction. However, no
								method of transmission over the Internet or electronic storage
								is 100% secure, and we cannot guarantee absolute security.
							</p>
						</section>

						{/* Your Rights */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								7. Your Rights
							</h2>
							<p>
								Depending on your location, you may have certain rights
								regarding your personal information, including:
							</p>
							<ul className="list-disc pl-6 space-y-2">
								<li>The right to access and receive a copy of your data</li>
								<li>The right to correct inaccurate information</li>
								<li>The right to request deletion of your data</li>
								<li>The right to restrict or object to certain processing</li>
								<li>The right to data portability</li>
							</ul>
							<p>
								To exercise these rights, please contact us using the
								information provided below.
							</p>
						</section>

						{/* Cookies */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								8. Cookies and Tracking Technologies
							</h2>
							<p>
								We use cookies and similar tracking technologies to collect
								information about your browsing activities. You can control
								cookies through your browser settings. Note that disabling
								cookies may affect the functionality of our website.
							</p>
						</section>

						{/* Third-Party Links */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								9. Third-Party Links
							</h2>
							<p>
								Our services may contain links to third-party websites or
								services. We are not responsible for the privacy practices of
								these third parties. We encourage you to review the privacy
								policies of any third-party sites you visit.
							</p>
						</section>

						{/* Children */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								10. Children&apos;s Privacy
							</h2>
							<p>
								Our services are not intended for individuals under the age of
								16. We do not knowingly collect personal information from
								children. If we become aware that we have collected data from a
								child without parental consent, we will take steps to delete
								that information.
							</p>
						</section>

						{/* Changes */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								11. Changes to This Policy
							</h2>
							<p>
								We may update this Privacy Policy from time to time. We will
								notify you of any material changes by posting the new policy on
								this page and updating the &quot;Last updated&quot; date. Your
								continued use of our services after such changes constitutes
								acceptance of the updated policy.
							</p>
						</section>

						{/* Contact */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								12. Contact Us
							</h2>
							<p>
								If you have any questions about this Privacy Policy or our data
								practices, please contact us at:
							</p>
							<p className="text-neutral-100">
								Email:{" "}
								<a
									href="mailto:privacy@supersetlabs.com"
									className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
								>
									privacy@supersetlabs.com
								</a>
							</p>
						</section>
					</div>
				</article>
			</main>
			<Footer />
		</>
	);
}
