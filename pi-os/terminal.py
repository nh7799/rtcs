"""A real Linux lab PC PTY with a JSON control stream on stdin."""
import errno
import fcntl
import json
import os
import pty
import pwd
import selectors
import signal
import struct
import sys
import termios


def exchange(master):
    pending = b""
    with selectors.DefaultSelector() as events:
        events.register(sys.stdin, selectors.EVENT_READ, "app")
        events.register(master, selectors.EVENT_READ, "terminal")
        while True:
            for event, _ in events.select():
                try:
                    data = os.read(event.fd, 4096)
                except OSError as error:
                    if error.errno == errno.EIO:
                        return
                    raise
                if not data:
                    return
                if event.data == "terminal":
                    sys.stdout.buffer.write(data)
                    sys.stdout.buffer.flush()
                    continue
                pending += data
                while b"\n" in pending:
                    line, pending = pending.split(b"\n", 1)
                    request = json.loads(line)
                    if request["type"] == "keys":
                        os.write(master, request["data"].encode("utf-8"))
                    else:
                        size = struct.pack("HHHH", request["rows"], request["cols"], 0, 0)
                        fcntl.ioctl(master, termios.TIOCSWINSZ, size)


pid, master = pty.fork()
if pid == 0:
    os.chdir(pwd.getpwuid(os.getuid()).pw_dir)
    os.environ.update(TERM="xterm-256color", PS1=r"SPECSuser@lab-pc:\w$ ")
    os.execv("/bin/bash", ["bash", "--norc", "-i"])
try:
    exchange(master)
finally:
    os.close(master)
    try:
        os.killpg(pid, signal.SIGHUP)
    except ProcessLookupError:
        pass
