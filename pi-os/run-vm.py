"""Boot Raspberry Pi OS and relay its UART independently of its Ethernet link."""
import json
import os
from pathlib import Path
import selectors
import socket
import subprocess
import sys
import tempfile
import time


def qemu_args(disk, cmdline, verify=False):
    storage = "file=/tmp/verification.qcow2,format=qcow2,if=sd" if verify else f"file={disk / 'sd.img'},format=raw,if=sd"
    return [
        "qemu-system-aarch64", "-M", "raspi3b", "-smp", "4", "-m", "1G",
        "-display", "none", "-monitor", "none", "-no-reboot",
        "-kernel", disk / "kernel8.img", "-dtb", disk / "bcm2710-rpi-3-b.dtb",
        "-initrd", disk / "initramfs8", "-append",
        "root=/dev/mmcblk0p2 rw rootwait net.ifnames=0 usbcore.autosuspend=-1 "
        "loglevel=3 panic=5 systemd.show_status=no systemd.mask=hciuart.service " + cmdline,
        "-drive", storage,
        "-device", "usb-net,netdev=bench,id=ethernet,mac=52:54:00:12:34:56",
        "-netdev", "user,id=bench,net=10.0.1.0/24,host=10.0.1.1,dhcpstart=10.0.1.2,"
        "hostfwd=tcp:127.0.0.1:2222-10.0.1.2:22,restrict=on",
    ]


def provision(disk):
    subprocess.run([
        *qemu_args(disk, "console=ttyAMA1,115200 systemd.run=/boot/firmware/initio/provision.sh "
                       "systemd.unit=kernel-command-line.target systemd.run_success_action=poweroff "
                       "systemd.run_failure_action=poweroff"), "-serial", "stdio",
    ], check=True, timeout=480)


def connect(path, emulator):
    deadline = time.monotonic() + 12
    client = socket.socket(socket.AF_UNIX)
    try:
        while time.monotonic() < deadline and emulator.poll() is None:
            try:
                client.connect(str(path))
                client.settimeout(2)
                return client
            except (FileNotFoundError, ConnectionRefusedError):
                time.sleep(0.04)
    except OSError:
        client.close()
        raise
    client.close()
    raise RuntimeError("The Pi emulator stopped before its serial channel opened.")


def command(qmp, operation, **arguments):
    request = {"execute": operation, "arguments": arguments}
    qmp.write(json.dumps(request).encode("ascii") + b"\n")
    qmp.flush()
    while line := qmp.readline():
        reply = json.loads(line)
        if "return" in reply:
            return reply["return"]
        if "error" in reply:
            raise RuntimeError(reply["error"]["desc"])
    raise RuntimeError("Lost the Pi emulator control connection.")


def ssh_available():
    try:
        with socket.create_connection(("127.0.0.1", 2222), timeout=0.15) as connection:
            return connection.recv(32).startswith(b"SSH-")
    except OSError:
        return False


def report(kind, **fields):
    print(json.dumps({"type": kind, **fields}, separators=(",", ":")), flush=True)


def exchange(emulator, qmp, uart, cable, boot_time):
    qmp.readline()
    command(qmp, "qmp_capabilities")
    command(qmp, "set_link", name="ethernet", up=cable)
    command(qmp, "cont")
    report("link", connected=cable)
    bridge_ready = False
    ssh_ready = False
    next_probe = 0.0
    pending_clock = True
    inputs = {"app": b"", "pi": b""}
    with selectors.DefaultSelector() as events:
        events.register(sys.stdin, selectors.EVENT_READ, "app")
        events.register(uart, selectors.EVENT_READ, "pi")
        while emulator.poll() is None:
            for event, _ in events.select(0.05):
                key = event.data
                data = os.read(event.fd, 4096)
                if not data:
                    return key == "app"
                inputs[key] += data
                if len(inputs[key]) > 8192:
                    inputs[key] = b""
                while b"\n" in inputs[key]:
                    line, inputs[key] = inputs[key].split(b"\n", 1)
                    if key == "pi":
                        if not bridge_ready and not line.startswith(b"D "):
                            print(line.decode("utf-8", "replace").strip(), file=sys.stderr)
                        try:
                            tag, pid, left, right, led = line.split()
                            if tag != b"D":
                                continue
                            if not bridge_ready:
                                bridge_ready = True
                                report("os", booted=True)
                            if pending_clock:
                                uart.sendall(f"T {int(time.time())} {boot_time}\n".encode("ascii"))
                                pending_clock = False
                            report("hardware", pid=int(pid), left=int(left), right=int(right), led=led == b"1")
                        except ValueError:
                            continue
                        continue
                    request = json.loads(line)
                    if request["type"] == "sensors" and bridge_ready:
                        data = " ".join(map(str, request["values"]))
                        uart.sendall(f"S {data}\n".encode("ascii"))
                    elif request["type"] == "link":
                        cable = request["connected"]
                        command(qmp, "set_link", name="ethernet", up=cable)
                        report("link", connected=cable)
                    elif request["type"] == "off":
                        return True
            if time.monotonic() >= next_probe:
                reachable = bridge_ready and cable and ssh_available()
                if reachable != ssh_ready:
                    ssh_ready = reachable
                    report("ssh", ready=reachable)
                next_probe = time.monotonic() + (3 if ssh_ready else 0.75)
    return False


def boot(disk, cable, verify):
    boot_time = int(time.time())
    with tempfile.TemporaryDirectory(prefix="piboard-") as work:
        qmp_path = Path(work) / "qmp"
        uart_path = Path(work) / "uart"
        emulator = subprocess.Popen([
            *qemu_args(disk, "console=ttyAMA1,115200", verify), "-S", "-qmp", f"unix:{qmp_path},server=on,wait=off",
            "-chardev", f"socket,id=initio,path={uart_path},server=on,wait=off", "-serial", "chardev:initio",
        ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
        try:
            with connect(qmp_path, emulator) as control, connect(uart_path, emulator) as uart:
                with control.makefile("rwb") as qmp:
                    forced = exchange(emulator, qmp, uart, cable, boot_time)
            if forced and emulator.poll() is None:
                emulator.terminate()
            code = emulator.wait(timeout=8)
            report("off", clean=not forced and code == 0)
            if code and not forced:
                raise RuntimeError(f"The Pi emulator exited with status {code}.")
        finally:
            if emulator.poll() is None:
                emulator.kill()
                emulator.wait()


if __name__ == "__main__":
    mode, directory, *options = sys.argv[1:]
    if mode == "provision":
        provision(Path(directory))
    elif mode == "boot":
        boot(Path(directory), "connected" in options, "verify" in options)
    else:
        raise SystemExit("Expected provision or boot")
