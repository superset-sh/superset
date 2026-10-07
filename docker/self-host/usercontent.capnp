using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
 services = [
  (name = "usercontent", worker = .usercontentWorker),
  (name = "internet", network = (allow = ["public"@PRIVATE_ADDRESSES@], tlsOptions = (trustBrowserCas = true))),
 ],
 sockets = [(name = "http", address = "*:8787", http = (), service = "usercontent")],
);
const usercontentWorker :Workerd.Worker = (
 compatibilityDate = "2026-07-01",
 compatibilityFlags = ["nodejs_als"],
 modules = [
  (name = "entry.js", esModule = embed "usercontent-entry.js"),
  (name = "s3-bucket.js", esModule = embed "s3-bucket.js"),
  (name = "index.js", esModule = embed "index.js"),
 ],
 bindings = [
  @OPTIONAL_BINDINGS@
  (name = "USERCONTENT_URL", fromEnvironment = "USERCONTENT_URL"),
  (name = "MEDIA_URL", fromEnvironment = "MEDIA_URL"),
  (name = "APP_URL", fromEnvironment = "APP_URL"),
  (name = "REALTIME_URL", fromEnvironment = "REALTIME_URL"),
  (name = "FRAME_ANCESTORS", fromEnvironment = "FRAME_ANCESTORS"),
  (name = "USERCONTENT_TOKEN_SECRET", fromEnvironment = "USERCONTENT_TOKEN_SECRET"),
  (name = "S3_ENDPOINT", fromEnvironment = "S3_ENDPOINT"),
  (name = "S3_BUCKET", fromEnvironment = "S3_BUCKET"),
  (name = "S3_ACCESS_KEY", fromEnvironment = "S3_ACCESS_KEY"),
  (name = "S3_SECRET_KEY", fromEnvironment = "S3_SECRET_KEY"),
 ],
 globalOutbound = "internet",
);
