/**
 * Copies every Sentry envelope to Sazabi, in addition to Sentry.
 *
 * It is an integration rather than a `transport` option so it rides on
 * whichever transport the SDK already picked — the Next.js tunnel route, the
 * Electron offline queue, React Native's native transport, the Cloudflare
 * isolate buffer — without replacing it. Sentry's delivery, rate limits and
 * flush results stay exactly what they were, and a Sazabi failure can never
 * delay or drop a Sentry send. The copy always goes direct: the tunnel route
 * only forwards to Sentry.
 */
import {
	type BaseTransportOptions,
	createEnvelope,
	createTransport,
	dsnFromString,
	type Envelope,
	getEnvelopeEndpointWithUrlEncodedAuth,
	suppressTracing,
	type Transport,
} from "@sentry/core";

/** Sazabi's Sentry-compatible intake; SAZABI_SENTRY_DSN overrides it. */
export const DEFAULT_SAZABI_SENTRY_DSN =
	"https://sazabi@eda48be996bc465e335059f0f419c497.us-west-2.intake.sazabi.com/0";

// Structural, with `never` for the envelope: Electron and React Native build on
// other @sentry/core versions, whose Envelope types are not interchangeable.
// Envelopes only pass through here unchanged apart from the DSN header.
interface TransportLike {
	send(envelope: never): PromiseLike<unknown>;
	flush(timeout?: number): PromiseLike<boolean>;
}
interface ClientWithTransport {
	getTransport(): TransportLike | undefined;
}
type TransportFactory = (options: {
	url: string;
	recordDroppedEvent: () => void;
}) => TransportLike;

/** For runtimes whose SDK exports no transport of its own (edge, Workers, RN). */
function makeFetchTransport(options: BaseTransportOptions): Transport {
	return createTransport(options, ({ body }) =>
		suppressTracing(async () => {
			const response = await fetch(options.url, {
				method: "POST",
				// serializeEnvelope's bytes are always ArrayBuffer-backed.
				body: body as string | Uint8Array<ArrayBuffer>,
			});
			// Workers warn about, and may hold the isolate for, unread bodies.
			await response.text().catch(() => undefined);
			return {
				statusCode: response.status,
				headers: {
					"x-sentry-rate-limits": response.headers.get("X-Sentry-Rate-Limits"),
					"retry-after": response.headers.get("Retry-After"),
				},
			};
		}),
	);
}

export function sazabiIntegration({
	dsn,
	transport: makeTransport = makeFetchTransport,
}: {
	/** Defaults to {@link DEFAULT_SAZABI_SENTRY_DSN} when unset or empty. */
	dsn?: string;
	/** The SDK's own HTTP transport, when it exports one. */
	transport?: TransportFactory;
} = {}) {
	const sazabiDsn = dsn || DEFAULT_SAZABI_SENTRY_DSN;
	return {
		name: "Sazabi",
		setup(client: ClientWithTransport): void {
			const sentry = client.getTransport();
			const parsedDsn = dsnFromString(sazabiDsn);
			if (!sentry || !parsedDsn) return;

			const sazabi = makeTransport({
				url: getEnvelopeEndpointWithUrlEncodedAuth(parsedDsn),
				// Sazabi's drops are not Sentry's to report.
				recordDroppedEvent: () => {},
			});
			const sendToSentry = sentry.send.bind(sentry);
			const flushSentry = sentry.flush.bind(sentry);

			sentry.send = (envelope: Envelope) => {
				// Readdressed so the copy is attributed to Sazabi's DSN.
				const copy = createEnvelope<typeof envelope>(
					{ ...envelope[0], dsn: sazabiDsn },
					envelope[1],
				);
				sazabi.send(copy as never).then(undefined, () => undefined);
				return sendToSentry(envelope as never);
			};
			sentry.flush = async (timeout) => {
				const [flushed] = await Promise.all([
					flushSentry(timeout),
					sazabi.flush(timeout),
				]);
				return flushed;
			};
		},
	};
}
