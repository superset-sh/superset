# Always-on host for the App Store review account. See README.md.
FROM ubuntu:24.04

# The version the reviewer's app talks to. This is the ONLY place it is set —
# the machine's rootfs resets to this image on every restart, so updating
# host-service on the running box silently reverts. Bump this with each release.
ARG SUPERSET_VERSION=1.26.0
ARG GH_VERSION=2.100.0

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git python3 \
 && rm -rf /var/lib/apt/lists/*

# CLI + host-service bundle: bin/superset, bin/superset-host, lib/, share/migrations.
RUN curl -fsSL -o /tmp/superset.tar.gz \
      "https://github.com/superset-sh/superset/releases/download/cli-v${SUPERSET_VERSION}/superset-linux-x64.tar.gz" \
 && mkdir -p /root/superset \
 && tar -xzf /tmp/superset.tar.gz -C /root/superset \
 && rm /tmp/superset.tar.gz
ENV PATH="/root/superset/bin:${PATH}"

# The agent the reviewer actually runs. Deliberately unpinned — the image is
# rebuilt per release, and a stale agent is its own bad review.
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"

# Agents reach for gh unprompted; without it they improvise and fail.
RUN curl -fsSL -o /tmp/gh.tar.gz \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
 && tar -xzf /tmp/gh.tar.gz -C /tmp \
 && install -m0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
 && rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_amd64"

# The two projects the reviewer browses. Baked in as real git repos so
# `superset projects create --import` has something to cut worktrees from;
# they intentionally have no remote.
COPY demo /demo
RUN git config --global user.email "appreview@superset.sh" \
 && git config --global user.name "Superset" \
 && git config --global init.defaultBranch main \
 && for repo in /demo/*; do \
      git -C "$repo" init -q \
      && git -C "$repo" add -A \
      && git -C "$repo" commit -qm "Initial commit"; \
    done

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
