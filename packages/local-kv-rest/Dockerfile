FROM golang:1.25.1 AS build

WORKDIR /src
COPY main.go .

RUN CGO_ENABLED=0 GOOS=linux go build -o /local-kv-rest main.go

FROM scratch

COPY --from=build /local-kv-rest /local-kv-rest

EXPOSE 80

ENV PORT=80
ENV REDIS_ADDR=redis:6379
ENV KV_REST_API_TOKEN=local-kv-token

ENTRYPOINT ["/local-kv-rest"]
