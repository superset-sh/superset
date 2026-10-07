# Sandbox asset mirror

The existing `CDN_URL` is the public HTTPS base before the `/sandbox` namespace.
`CDN_URL=https://assets.example.com/releases` selects
`https://assets.example.com/releases/sandbox`. The build renders that canonical
base into `contract.sh` and hashes it as part of the bundle. The existing image
flow copies the same completed bundle and applies that contract before fetching
assets. No new environment variable, boot identity field or image renderer is
needed. With no `CDN_URL`, a build retains `https://cdn.superset.sh/sandbox`.
Publication still requires the existing `CDN_URL` and `CDN_R2_*` credentials.

Use a nonsecret HTTPS DNS hostname, an optional decimal port from 1 to 65535 and
plain path prefixes. A final slash, host/scheme case and default port normalize
to the same bytes. Credentials, percent escapes, queries, fragments, whitespace,
backslashes, dot traversal, duplicate path separators, IP literals and localhost
are refused before build changes or bucket requests. DNS validation is syntax
only; it proves no public routing or TLS. The namespace is always appended:
a base already ending `/sandbox` produces `/sandbox/sandbox`.

Build and publish with the same canonical `CDN_URL`. The publisher refuses a
completed bundle whose captured public base differs from the current bucket's
public base, including dry runs, before HEAD/PUT. Do not run another build in the
same package directory while retaining an older `BuiltBundle`: current dist
paths are reused. Use the same intact completed artifact for publish and image.
The image inherits its captured contract and does not consult a later ambient
`CDN_URL`.

Production publication uses the existing configured R2 endpoint and bucket;
public URLs use `CDN_URL`. Publish the real content-addressed assets and bundle
first. A successful storage PUT does not prove the public mirror works. Before
adoption, verify unauthenticated GET of each relevant public URL from the sandbox
network, compare its bytes with the expected SHA and verify public DNS/TLS.
The upstream CDN is not assumed writable. This code does not configure a mirror,
publish objects, push an image or update environment rows.

A starter image or golden must already carry the mirror contract. Boot reads the
installed old contract to fetch the next bundle, then applies and reads the new
contract. A mirror-only bundle cannot move an old upstream-contract image or
golden merely by changing `bundleSha`. Use the existing image flow to build an
aligned starter image from the published bundle; refresh any golden from that
image. Probe a fresh fork and its stop/wake, inspect installed contract, current
bundle hash and tool hashes/version, then adopt the environment's source and
`bundleSha` through the existing release/operator flow. Healthy serving wake
skips boot and does not install this change; existing boxes need a separately
planned cold adoption. Bundle and asset fetches can fail open and retain old
tools, so a healthy host alone is insufficient installation evidence.

The mirror supplies assets, not API connectivity. An externally hosted sandbox
still needs reachable public HTTPS API/broker ingress. A private overlay-network API is
not assumed reachable. The optional standalone broker does not deploy that
ingress or prove OIDC/session/provider forwarding, request limits or external
large-body acceptance. Mirror reachability, environment adoption and provider
acceptance require separate authorized checks.

Pure checks use `bun --no-env-file test packages/shared/src/sandbox-contract.assets.test.ts packages/sandbox/src/build.test.ts` from the repository root. The
actual caller fixture runs in a cleared child with owned scratch build trees,
denied fetch/socket access and fake storage/registry/Docker boundaries. It does
not publish, build an image, access credentials or contact a provider. Actual
public mirror and cloud installation proof remain separate.
