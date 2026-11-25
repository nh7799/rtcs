"""Extract a verified Raspberry Pi OS image into a sparse virtual SD card."""
import json
import os
from pathlib import Path
import struct
import subprocess
import sys


def partitions(header):
    if header[510:512] != b"\x55\xaa":
        raise ValueError("Raspberry Pi OS image has no DOS partition table")
    boot, root = struct.unpack_from("<II", header, 454), struct.unpack_from("<II", header, 470)
    if boot[0] == 0 or boot[0] + boot[1] != root[0] or root[1] == 0 or header[466] != 0x83:
        raise ValueError("Unexpected Raspberry Pi OS partition layout")
    return boot, root


def unpack(directory):
    temporary = directory / "sd.partial"
    try:
        with subprocess.Popen(["xz", "-dc", directory / "raspios.img.xz"], stdout=subprocess.PIPE) as source:
            with temporary.open("wb") as disk:
                header = bytearray(source.stdout.read(512))
                boot, root = partitions(header)
                # QEMU's Pi SD controller requires a power-of-two card size.
                capacity = 4 * 1024**3
                expected = (root[0] + root[1]) * 512
                if expected > capacity:
                    raise ValueError("Raspberry Pi OS image exceeds the virtual SD capacity")
                struct.pack_into("<I", header, 474, capacity // 512 - root[0])
                disk.write(header)
                for block in iter(lambda: source.stdout.read(1024 * 1024), b""):
                    for start in range(0, len(block), 4096):
                        page = block[start:start + 4096]
                        if page.count(0) == len(page):
                            disk.seek(len(page), os.SEEK_CUR)
                        else:
                            disk.write(page)
                    if disk.tell() > capacity:
                        raise ValueError("Invalid Raspberry Pi OS image size")
                if disk.tell() < expected or source.wait() != 0:
                    raise ValueError("Raspberry Pi OS download was incomplete")
                disk.truncate(capacity)
        temporary.rename(directory / "sd.img")
        (directory / "partitions.json").write_text(json.dumps({"bootOffset": boot[0] * 512}, indent=2) + "\n")
    finally:
        temporary.unlink(missing_ok=True)


def boot_files(directory, assets=None):
    offset = json.loads((directory / "partitions.json").read_text())["bootOffset"]
    disk = str(directory / "sd.img") + "@@" + str(offset)
    for name in ["kernel8.img", "initramfs8", "bcm2710-rpi-3-b.dtb"]:
        subprocess.run(["mcopy", "-o", "-i", disk, "::" + name, directory / name], check=True)
    # The Pi 3 uses this UART for Bluetooth by default. Expose it as a tty for the bridge.
    subprocess.run(["fdtput", "-t", "s", directory / "bcm2710-rpi-3-b.dtb",
                    "/soc/serial@7e201000/bluetooth", "status", "disabled"], check=True)
    if assets:
        subprocess.run(["mdeltree", "-i", disk, "::/initio"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["mmd", "-i", disk, "::/initio"], check=True)
        for file in Path(assets).iterdir():
            subprocess.run(["mcopy", "-o", "-s", "-i", disk, file, "::/initio/"], check=True)


if __name__ == "__main__":
    action, directory, *assets = sys.argv[1:]
    directory = Path(directory)
    if action == "unpack":
        unpack(directory)
    elif action == "boot-files":
        boot_files(directory, *assets)
    elif action == "ready":
        offset = json.loads((directory / "partitions.json").read_text())["bootOffset"]
        disk = str(directory / "sd.img") + "@@" + str(offset)
        if subprocess.run(["mdir", "-i", disk, "::/initio/READY"]).returncode:
            subprocess.run(["mtype", "-i", disk, "::/initio/provision.log"])
            raise SystemExit("The Raspberry Pi OS guest did not finish provisioning")
        subprocess.run(["mdeltree", "-i", disk, "::/initio"], check=True)
    else:
        raise SystemExit("Expected unpack or boot-files")
