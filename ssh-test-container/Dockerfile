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
