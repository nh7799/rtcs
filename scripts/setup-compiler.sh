#!/usr/bin/env bash
set -euo pipefail

version=4.0.10
project=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
sdk="$project/.initio-toolchain/emsdk"

for dependency in git python3; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Compiler setup requires %s. Install it and rerun npm run setup:compiler.\n' "$dependency" >&2
    exit 1
  fi
done

if [[ ! -f "$sdk/emsdk" ]]; then
  mkdir -p "$(dirname "$sdk")"
  git clone --depth 1 --branch "$version" https://github.com/emscripten-core/emsdk.git "$sdk"
fi

"$sdk/emsdk" install "$version"
"$sdk/emsdk" activate "$version"
EM_CONFIG="$sdk/.emscripten" "$sdk/upstream/emscripten/emcc" --version
"$sdk/upstream/bin/wasm-opt" --version
printf '\nCompiler ready. Run npm run dev from the project folder.\n'
