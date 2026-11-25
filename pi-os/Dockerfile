FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    qemu-system-arm qemu-utils mtools device-tree-compiler \
    python3 openssh-client ca-certificates xz-utils gcc libc6-dev make util-linux file nano \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash -u 1001 SPECSuser \
    && useradd -M -s /usr/sbin/nologin -u 1002 piboard
