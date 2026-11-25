#!/bin/bash
set -euo pipefail
export LC_ALL=C

if [[ "${1:-}" == 'receive' ]]; then
    mkdir /work/source
    cd /work/source
    tar --no-overwrite-dir --no-same-owner --no-same-permissions --touch -xf -
    export INITIO_WERROR="${3:-0}"
    exec /usr/bin/make --no-print-directory -f /opt/initio/Makefile "$2"
fi

mapfile -d '' sources < <(find . -type f -name '*.c' -print0 | sort -z)
if (( ${#sources[@]} == 0 )); then
    echo 'No C source files found.' >&2
    exit 1
fi
compiler=/usr/bin/arm-linux-gnueabihf-gcc
flags=(-std=c11 -O1 -Wall -Wextra -Werror=implicit-function-declaration -fno-diagnostics-color
       -march=armv7-a -mfpu=vfpv3-d16 -mfloat-abi=hard -I /opt/initio/shim -I .)
if [[ "${INITIO_WERROR:-0}" == 1 ]]; then flags+=(-Werror); fi
if [[ "$1" == 'syntax' ]]; then
    "$compiler" "${flags[@]}" -fsyntax-only "${sources[@]}" >&2
else
    "$compiler" "${flags[@]}" -static "${sources[@]}" /opt/initio/shim/bridge.c /opt/initio/native.c -o /work/controller >&2
    cat /work/controller
fi
