# SSH Test Container for Superset

## Files

### Dockerfile
```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    openssh-server \
    git \
    curl \
    vim \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Create SSH directory and configure
RUN mkdir /var/run/sshd

# Create a test user (password: test)
RUN useradd -m -s /bin/bash testuser && \
    echo 'testuser:test' | chpasswd && \
    usermod -aG sudo testuser

# Allow password authentication (for easy testing)
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config

# Create .ssh directory for key-based auth
RUN mkdir -p /home/testuser/.ssh && \
    chmod 700 /home/testuser/.ssh && \
    chown -R testuser:testuser /home/testuser/.ssh

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
```

### docker-compose.yml
```yaml
services:
  ssh-server:
    build: .
    container_name: superset-ssh-test
    ports:
      - "2222:22"
    volumes:
      # Uncomment to mount your public key for key-based auth
      # - ~/.ssh/id_rsa.pub:/home/testuser/.ssh/authorized_keys:ro
      - ./workspace:/home/testuser/workspace
    restart: unless-stopped
```

## Usage
```bash
# Build and start
docker-compose up -d --build

# SSH in (password: test)
ssh testuser@localhost -p 2222
```

## Key-Based Auth Setup
```bash
docker cp ~/.ssh/id_rsa.pub superset-ssh-test:/home/testuser/.ssh/authorized_keys
docker exec superset-ssh-test chown testuser:testuser /home/testuser/.ssh/authorized_keys
docker exec superset-ssh-test chmod 600 /home/testuser/.ssh/authorized_keys
```

## Connection Details

| Field    | Value     |
|----------|-----------|
| Host     | localhost |
| Port     | 2222      |
| Username | testuser  |
| Password | test      |
