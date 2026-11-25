#!/bin/bash
# Double-click on macOS to open the lab as a native app window.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -d node_modules ] || npm install
npm run app
