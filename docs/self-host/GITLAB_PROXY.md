# Optional standalone GitLab sandbox broker

The API's Next route remains the default. It declares an 800-second hosting duration and ends binary broker work after 790 seconds. The standalone Node broker retains a 15-minute binary deadline for longer transfers. A self-hosted Node API may already support streaming Git and LFS bodies. For a deployment whose public Next ingress imposes a body limit (including Vercel's 4.5 MB function payload limit), this optional Node entrypoint runs the same GitLab sandbox broker behind a separately operated public HTTPS ingress. It changes no authentication, GitLab allowlist, provisioning policy or client credentials.

Build from the repository root with the existing Bun installation and installed workspace dependencies:

```sh
bun run --cwd packages/trpc build:gitlab-proxy
```

Run the generated Node ESM entrypoint from the package directory:

```sh
cd packages/trpc
node dist/gitlab-proxy.js --listen 127.0.0.1:8790
```

The default listen address is `127.0.0.1:8790`. An explicit IPv4 address, hostname or bracketed IPv6 address and port 1–65535 is accepted. Unknown options fail startup. Node 24 or later is required; this is a Node runtime, not a Bun HTTP server. The bundle is also safe to import without binding a listener.

Provide the existing application's required environment through the operator's existing secret mechanism. The genuine broker imports the existing application/auth/database environment validators; the four sandbox settings alone are not a complete application configuration. No `.env` loader or environment validation bypass is added by this entrypoint. Existing transitive auth/database modules retain their dotenv behavior. Refer to [environment variables](../environment-variables.md). The existing sandbox issuer, token, team and project settings are required. The public URL comes from `GITLAB_SANDBOX_PROXY_URL`, or from `NEXT_PUBLIC_API_URL` plus `/api/gitlab/proxy` when no explicit proxy URL is configured. It must match the URL installed in the sandbox proxy policy and the signed audience. Do not pass secrets as command line arguments.

TLS must terminate at a trusted ingress exposing that configured HTTPS URL on port 443. This server listens using plain HTTP behind that ingress. Incoming request targets must already carry the configured path prefix; the adapter does not rewrite unrelated routes into the broker. It constructs the Web Request URL from the trusted configured public origin and the validated target, ignoring client Host and forwarded-host headers. Existing Vercel sandbox OIDC and forwarded provider headers pass to the genuine broker unchanged. This does not prove that a provider forwards those headers or accepts this deployment. A private NetBird API is not assumed reachable by a Vercel sandbox.

`GET /healthz` and `HEAD /healthz` return a bounded readiness response once startup succeeds. Admission checks run first: saturation and shutdown return 503, including for the public health path. Health responses disclose no configuration or credentials and do not check database or provider health. The configured broker mount takes precedence: when it includes `/healthz` (including a root mount), that path is protected by the broker. Use a distinct mount for a public health endpoint. Only the broker's existing GET, HEAD, POST and PUT methods are admitted under the configured mount. Upgrade and CONNECT requests are refused. The broker's supported paths, authorization, body limits, ticket expiry and transport deadlines remain authoritative.

The adapter streams bodies with backpressure. It admits at most 32 active broker requests and 128 open connections, allows 32 KiB request headers with a 15-second header deadline, and retains each request slot through response completion. It applies a 16-minute outer request deadline above the broker's 15-minute binary operation deadline. Keep-alive connections expire after five seconds. Before response headers, adapter failures return constant no-store errors; failed partial bodies terminate the connection. Client disconnect and shutdown abort broker work. SIGINT and SIGTERM stop admission, abort active work and close remaining sockets within five seconds.

The operator must configure public reachability, TLS, request/body/response limits and timeouts at every external ingress. A smaller ingress limit or shorter timeout still prevents large transfers. This change deploys no server, updates no ingress or network policy, and supplies no production credentials. Live OIDC/session matching, provider forwarding, external large-body acceptance and sandbox lifecycle acceptance require separate verification.
