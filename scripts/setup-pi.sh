#!/usr/bin/env bash
set -euo pipefail

project=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if ! command -v docker >/dev/null 2>&1 || ! docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    printf '%s\n' 'Install and start Docker Desktop (macOS) or Docker Engine (Linux), then rerun npm run setup:pi.' >&2
    exit 1
fi

endpoint=$(docker context inspect --format '{{.Endpoints.docker.Host}}')
if [[ "${DOCKER_HOST:-$endpoint}" != unix://* || "$endpoint" != unix://* ]]; then
    printf '%s\n' 'Select a local Docker context before setting up the Pi rehearsal.' >&2
    exit 1
fi

docker build --tag initio-lab-pi:1 --file "$project/pi-runtime/Dockerfile" "$project"
printf '\nPi toolchain ready. Open Pi terminal rehearsal and select Raspberry Pi ARM/QEMU.\n'
