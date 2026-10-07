#!/bin/sh
set -eu

TOK="${GARAGE_ADMIN_TOKEN:?GARAGE_ADMIN_TOKEN required}"
export GARAGE_RPC_SECRET="${GARAGE_RPC_SECRET:?GARAGE_RPC_SECRET required}"
AK="${S3_ACCESS_KEY:?S3_ACCESS_KEY required}"
SK="${S3_SECRET_KEY:?S3_SECRET_KEY required}"
PRIVATE="${S3_BUCKET:?S3_BUCKET required}"
PUBLIC="${S3_PUBLIC_BUCKET:?S3_PUBLIC_BUCKET required}"
[ "$PRIVATE" != "$PUBLIC" ] || { echo "private and public buckets must be different" >&2; exit 1; }
ADMIN="${GARAGE_ADMIN_URL:-http://garage:3903}"

for attempt in $(seq 1 60); do
 if curl -fsS -o /dev/null "$ADMIN/health"; then break; fi
 sleep 1
done
status() { curl -fsS -H "Authorization: Bearer $TOK" "$ADMIN/v2/GetClusterStatus"; }
NID="$(status | jq -er '.nodes[0].id')"
H="$NID@${GARAGE_RPC_HOST:-garage:3901}"
KEY_EXISTS=0
if garage -h "$H" key info "$AK" >/dev/null 2>&1; then
 KEY_EXISTS=1
 export S3_ACCESS_KEY S3_SECRET_KEY
 if ! curl -fsS -G -H "Authorization: Bearer $TOK" \
  --data-urlencode "id=$AK" --data-urlencode "showSecretKey=true" "$ADMIN/v2/GetKeyInfo" | \
  jq -e '.accessKeyId == env.S3_ACCESS_KEY and .secretAccessKey == env.S3_SECRET_KEY' >/dev/null; then
  echo "retained Garage key does not match supplied credentials; rotate to a new key before reconciliation" >&2
  exit 1
 fi
fi
LV="$(status | jq -er '.layoutVersion')"
if [ "$LV" = "0" ]; then
 garage -h "$H" layout assign -z dc1 -c "${GARAGE_CAPACITY:-100G}" "$NID"
 garage -h "$H" layout apply --version 1
fi

for bucket in "$PRIVATE" "$PUBLIC"; do
 if ! garage -h "$H" bucket info "$bucket" >/dev/null 2>&1; then
  garage -h "$H" bucket create "$bucket"
 fi
done
bucket_id() {
 curl -fsS -G -H "Authorization: Bearer $TOK" --data-urlencode "globalAlias=$1" "$ADMIN/v2/GetBucketInfo" | jq -er '.id'
}
PRIVATE_ID="$(bucket_id "$PRIVATE")"
PUBLIC_ID="$(bucket_id "$PUBLIC")"
[ "$PRIVATE_ID" != "$PUBLIC_ID" ] || { echo "private and public aliases resolve to the same bucket" >&2; exit 1; }
if [ "$KEY_EXISTS" = "0" ]; then
 garage -h "$H" key import --yes -n superset-storage "$AK" "$SK"
fi
for bucket in "$PRIVATE" "$PUBLIC"; do
 garage -h "$H" bucket allow --read --write --owner "$bucket" --key "$AK"
done
garage -h "$H" bucket website --deny "$PRIVATE"
garage -h "$H" bucket website --allow "$PUBLIC"

export AWS_ACCESS_KEY_ID="$AK" AWS_SECRET_ACCESS_KEY="$SK" AWS_DEFAULT_REGION="${S3_REGION:-garage}"
cors_file="$(mktemp "${TMPDIR:-/tmp}/superset-storage-cors.XXXXXX")"
trap 'rm -f "$cors_file"' EXIT HUP INT TERM
jq -en --argjson origins "${STORAGE_CORS_ORIGINS:?STORAGE_CORS_ORIGINS JSON array required}" \
 'if ($origins | type) != "array" or ($origins | length) == 0 or
  (all($origins[]; type == "string" and (. == "null" or test("^https?://([A-Za-z0-9.-]+|\\[[0-9a-fA-F:]+\\])(:[0-9]+)?$"))) | not)
  then error("CORS origins must be a nonempty array of exact HTTP(S) origins or null")
  else {CORSRules: [$origins[] | {AllowedOrigins: [.], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["content-type", "content-length"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600}]} end' > "$cors_file"
aws --endpoint-url "${S3_ENDPOINT:-http://garage:3900}" s3api put-bucket-cors \
 --bucket "$PRIVATE" --cors-configuration "file://$cors_file"
