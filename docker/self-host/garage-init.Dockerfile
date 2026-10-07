FROM alpine:3.22
RUN apk add --no-cache curl jq aws-cli
COPY --from=dxflrs/garage:v2.0.0 /garage /usr/local/bin/garage
COPY docker/self-host/garage-init.sh /usr/local/bin/garage-init
ENTRYPOINT ["sh", "/usr/local/bin/garage-init"]
