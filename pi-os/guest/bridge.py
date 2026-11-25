"""Connect the guest's native Initio library to the virtual robot over its UART."""
import mmap
import os
from pathlib import Path
import select
import socket
import struct
import time
import tty


def active(pid):
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def main():
    directory = Path("/run/initio-lab")
    directory.mkdir(exist_ok=True)
    address = directory / "controller"
    address.unlink(missing_ok=True)
    sensor_format = struct.Struct("=5i")
    event_format = struct.Struct("=4i")
    device = os.open("/dev/ttyAMA1", os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    tty.setraw(device)
    pid, left, right, led = 0, 0, 0, 0
    last_input = 0.0
    serial = b""
    synced = False
    next_report = 0.0
    with (directory / "sensors").open("w+b") as store, socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as controller:
        store.truncate(sensor_format.size)
        (directory / "sensors").chmod(0o644)
        controller.bind(str(address))
        address.chmod(0o666)
        with mmap.mmap(store.fileno(), sensor_format.size) as reading:
            reading[:] = sensor_format.pack(1, 1, 0, 0, 0)
            while True:
                ready, _, _ = select.select([device, controller], [], [], 0.04)
                now = time.monotonic()
                if device in ready:
                    serial += os.read(device, 4096)
                    while b"\n" in serial:
                        line, serial = serial.split(b"\n", 1)
                        try:
                            command, *fields = line.split()
                            values = list(map(int, fields))
                            if command == b"S" and len(values) == 5 and all(v in (0, 1) for v in values[:4]) and 0 <= values[4] <= 1000:
                                reading[:] = sensor_format.pack(*values)
                                last_input = now
                            elif command == b"T" and len(values) == 2 and not synced:
                                time.clock_settime(time.CLOCK_REALTIME, values[0])
                                (directory / "boot-time").write_text(str(values[1]))
                                (directory / "time-ready").touch()
                                synced = True
                        except (ValueError, OSError):
                            continue
                    if len(serial) > 1024:
                        serial = b""
                if controller in ready:
                    message = controller.recv(64)
                    if len(message) == event_format.size:
                        kind, caller, a, b = event_format.unpack(message)
                        if kind == 1 and active(caller):
                            pid, left, right, led = caller, 0, 0, 0
                        elif caller == pid:
                            if kind == 2:
                                left, right = max(-100, min(100, a)), max(-100, min(100, b))
                            elif kind == 3:
                                led = int(a != 0)
                            elif kind == 4:
                                pid, left, right, led = 0, 0, 0, 0
                if now >= next_report:
                    if not active(pid):
                        pid, left, right, led = 0, 0, 0, 0
                    if now - last_input > 1:
                        left, right = 0, 0
                        reading[:] = sensor_format.pack(1, 1, 0, 0, 0)
                    try:
                        os.write(device, f"D {pid} {left} {right} {led}\n".encode("ascii"))
                    except BlockingIOError:
                        pass
                    next_report = now + 0.05


if __name__ == "__main__":
    main()
