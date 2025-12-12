import type { Metadata } from "next";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

export const metadata: Metadata = {
	title: "Terms of Service - Superset",
	description:
		"Read the terms and conditions that govern your use of Superset products and services.",
};

export default function TermsOfServicePage() {
	return (
		<>
			<Header />
			<main className="bg-neutral-900 pt-24 pb-16 min-h-screen">
				<article className="max-w-3xl mx-auto px-6 sm:px-8">
					<header className="border-b border-neutral-800 pb-8 mb-10">
						<h1 className="text-3xl sm:text-4xl font-medium text-neutral-100">
							Terms of Service
						</h1>
						<p className="mt-4 text-sm text-neutral-500">
							Last updated: December 11, 2025
						</p>
					</header>

					<div className="space-y-10 text-neutral-300 leading-relaxed">
						{/* Agreement */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								1. Agreement to Terms
							</h2>
							<p>
								These Terms of Service (&quot;Terms&quot;) constitute a legally
								binding agreement between you and Superset (&quot;we&quot;,
								&quot;us&quot;, or &quot;our&quot;) governing your access to and
								use of our website, desktop application, and related services
								(collectively, the &quot;Services&quot;).
							</p>
							<p>
								By accessing or using our Services, you agree to be bound by
								these Terms. If you do not agree to these Terms, you may not
								access or use our Services.
							</p>
						</section>

						{/* Eligibility */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								2. Eligibility
							</h2>
							<p>
								You must be at least 16 years of age to use our Services. By
								using our Services, you represent and warrant that you meet this
								requirement and have the legal capacity to enter into these
								Terms.
							</p>
						</section>

						{/* Account */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								3. Your Account
							</h2>
							<p>
								If you create an account with us, you are responsible for
								maintaining the confidentiality of your account credentials and
								for all activities that occur under your account. You agree to:
							</p>
							<ul className="list-disc pl-6 space-y-2">
								<li>
									Provide accurate and complete information when creating your
									account
								</li>
								<li>Update your information to keep it current</li>
								<li>
									Notify us immediately of any unauthorized access or security
									breach
								</li>
								<li>Not share your account credentials with any third party</li>
							</ul>
							<p>
								We reserve the right to suspend or terminate accounts that
								violate these Terms.
							</p>
						</section>

						{/* Permitted Use */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								4. Permitted Use
							</h2>
							<p>
								Subject to your compliance with these Terms, we grant you a
								limited, non-exclusive, non-transferable, revocable license to
								access and use our Services for your personal or internal
								business purposes.
							</p>
						</section>

						{/* Prohibited Conduct */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								5. Prohibited Conduct
							</h2>
							<p>You agree not to:</p>
							<ul className="list-disc pl-6 space-y-2">
								<li>
									Use the Services in any way that violates applicable laws or
									regulations
								</li>
								<li>
									Attempt to gain unauthorized access to our systems or other
									users&apos; accounts
								</li>
								<li>
									Interfere with or disrupt the integrity or performance of the
									Services
								</li>
								<li>
									Reverse engineer, decompile, or disassemble any part of the
									Services
								</li>
								<li>
									Use automated means to access the Services without our prior
									written consent
								</li>
								<li>Transmit any viruses, malware, or other malicious code</li>
								<li>
									Use the Services to infringe the intellectual property rights
									of others
								</li>
								<li>
									Resell or redistribute the Services without our authorization
								</li>
							</ul>
						</section>

						{/* Intellectual Property */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								6. Intellectual Property
							</h2>
							<p>
								The Services and all content, features, and functionality
								(including but not limited to software, text, graphics, logos,
								and design) are owned by Superset or our licensors and are
								protected by copyright, trademark, and other intellectual
								property laws.
							</p>
							<p>
								You retain ownership of any content you create using our
								Services. We do not claim any ownership rights over your code,
								projects, or other materials.
							</p>
						</section>

						{/* Open Source */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								7. Open Source Components
							</h2>
							<p>
								Our Services may include open source software components that
								are subject to their own license terms. Nothing in these Terms
								limits your rights under, or grants you rights that supersede,
								the terms of any applicable open source license.
							</p>
						</section>

						{/* Third-Party Services */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								8. Third-Party Services
							</h2>
							<p>
								Our Services may integrate with or link to third-party services
								(e.g., AI providers, version control platforms). Your use of
								such third-party services is subject to their respective terms
								and privacy policies. We are not responsible for the content,
								functionality, or practices of third-party services.
							</p>
						</section>

						{/* Payment */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								9. Payment and Subscriptions
							</h2>
							<p>
								Certain features of our Services may require payment. If you
								purchase a subscription:
							</p>
							<ul className="list-disc pl-6 space-y-2">
								<li>
									You agree to pay all applicable fees as described at the time
									of purchase
								</li>
								<li>
									Subscriptions automatically renew unless cancelled before the
									renewal date
								</li>
								<li>
									Refunds are provided in accordance with our refund policy or
									as required by law
								</li>
								<li>We may change pricing with reasonable notice to you</li>
							</ul>
						</section>

						{/* Disclaimer */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								10. Disclaimer of Warranties
							</h2>
							<p className="uppercase text-sm">
								THE SERVICES ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
								AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS
								OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
								MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
								NON-INFRINGEMENT.
							</p>
							<p>
								We do not warrant that the Services will be uninterrupted,
								error-free, or secure. You use the Services at your own risk.
							</p>
						</section>

						{/* Limitation of Liability */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								11. Limitation of Liability
							</h2>
							<p className="uppercase text-sm">
								TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUPERSET SHALL NOT BE
								LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
								PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE,
								ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICES.
							</p>
							<p>
								Our total liability for any claims arising under these Terms
								shall not exceed the amount you paid us, if any, in the twelve
								(12) months preceding the claim.
							</p>
						</section>

						{/* Indemnification */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								12. Indemnification
							</h2>
							<p>
								You agree to indemnify, defend, and hold harmless Superset and
								its officers, directors, employees, and agents from any claims,
								damages, losses, liabilities, and expenses (including reasonable
								attorneys&apos; fees) arising out of or related to your
								violation of these Terms or your use of the Services.
							</p>
						</section>

						{/* Termination */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								13. Termination
							</h2>
							<p>
								We may suspend or terminate your access to the Services at any
								time, with or without cause, and with or without notice. Upon
								termination, your right to use the Services will immediately
								cease.
							</p>
							<p>
								You may terminate your account at any time by discontinuing use
								of the Services and contacting us to request account deletion.
							</p>
						</section>

						{/* Governing Law */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								14. Governing Law
							</h2>
							<p>
								These Terms shall be governed by and construed in accordance
								with the laws of the State of Delaware, United States, without
								regard to its conflict of law provisions.
							</p>
						</section>

						{/* Dispute Resolution */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								15. Dispute Resolution
							</h2>
							<p>
								Any disputes arising out of or relating to these Terms or the
								Services shall first be attempted to be resolved through good
								faith negotiation. If negotiation fails, disputes shall be
								resolved through binding arbitration in accordance with the
								rules of the American Arbitration Association.
							</p>
						</section>

						{/* Changes */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								16. Changes to These Terms
							</h2>
							<p>
								We reserve the right to modify these Terms at any time. We will
								notify you of material changes by posting the updated Terms on
								our website and updating the &quot;Last updated&quot; date. Your
								continued use of the Services after such changes constitutes
								acceptance of the revised Terms.
							</p>
						</section>

						{/* Severability */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								17. Severability
							</h2>
							<p>
								If any provision of these Terms is found to be unenforceable or
								invalid, that provision shall be limited or eliminated to the
								minimum extent necessary, and the remaining provisions shall
								remain in full force and effect.
							</p>
						</section>

						{/* Entire Agreement */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								18. Entire Agreement
							</h2>
							<p>
								These Terms, together with our Privacy Policy, constitute the
								entire agreement between you and Superset regarding the Services
								and supersede all prior agreements and understandings.
							</p>
						</section>

						{/* Contact */}
						<section className="space-y-4">
							<h2 className="text-xl font-medium text-neutral-100">
								19. Contact Us
							</h2>
							<p>
								If you have any questions about these Terms, please contact us
								at:
							</p>
							<p className="text-neutral-100">
								Email:{" "}
								<a
									href="mailto:legal@supersetlabs.com"
									className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
								>
									legal@supersetlabs.com
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
