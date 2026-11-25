FROM debian:bookworm-slim
COPY shim /opt/initio/shim
COPY pi-runtime/Makefile pi-runtime/build.sh pi-runtime/run.sh pi-runtime/native.c /opt/initio/
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc-arm-linux-gnueabihf libc6-dev-armhf-cross make qemu-user \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /work \
    && chmod -R a+rX /opt/initio \
    && chmod 0555 /opt/initio/build.sh /opt/initio/run.sh
USER 65534:65534
WORKDIR /work
