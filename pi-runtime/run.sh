#!/bin/bash
set -euo pipefail
IFS= read -r size
if [[ ! "$size" =~ ^[0-9]{1,7}$ ]] || (( size < 52 || size > 2097152 )); then
    echo 'Invalid ARM build size.' >&2
    exit 125
fi
head -c "$size" > /work/controller
if [[ $(wc -c < /work/controller) != "$size" ]]; then
    echo 'Incomplete ARM build.' >&2
    exit 125
fi
chmod 0555 /work/controller
exec /usr/bin/timeout --kill-after=2s 300s /usr/bin/qemu-arm -cpu cortex-a7 /work/controller "$@"
