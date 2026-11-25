#!/bin/sh
# The worksheet links with its libraries before the C file.
exec /usr/bin/gcc -Wl,--no-as-needed "$@"
