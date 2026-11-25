"""Relay a local OpenSSH client to QEMU's private SSH forward."""

import os
import selectors
import socket
import sys


def relay(connection):
    with selectors.DefaultSelector() as events:
        events.register(sys.stdin, selectors.EVENT_READ)
        events.register(connection, selectors.EVENT_READ)
        while True:
            for event, _ in events.select():
                if event.fileobj is connection:
                    incoming = connection.recv(65536)
                    if not incoming:
                        return
                    sys.stdout.buffer.write(incoming)
                    sys.stdout.buffer.flush()
                else:
                    outgoing = os.read(sys.stdin.fileno(), 65536)
                    if not outgoing:
                        events.unregister(sys.stdin)
                        connection.shutdown(socket.SHUT_WR)
                    else:
                        connection.sendall(outgoing)


if __name__ == "__main__":
    try:
        with socket.create_connection(("127.0.0.1", 2222), timeout=4) as connection:
            connection.settimeout(10)
            relay(connection)
    except BrokenPipeError:
        pass
    except OSError as error:
        sys.exit(f"Virtual Pi SSH relay: {error}. Check Pi power and Ethernet in the lab.")
