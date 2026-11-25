#!/usr/bin/python3
"""Coursework scheduling commands for the local virtual SD card."""
from datetime import datetime
import json
import os
from pathlib import Path
import pty
import shutil
import subprocess
import sys
import time

state = Path.home() / ".local/state/initio-lab"
schedule = state / "next.json"
history = state / "last.json"


def read(path):
    return json.loads(path.read_text()) if path.is_file() else None


def save(path, data):
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as output:
        json.dump(data, output)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)


def record(program):
    executable = Path(program).resolve()
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise ValueError(f"{program} is missing or is not executable. Build it with make first.")
    save(schedule, {"program": str(executable), "cwd": str(Path.cwd()), "time": time.time()})
    print(f"Scheduled {executable.name} for the next boot within five minutes.")


def log():
    data = read(schedule)
    if data:
        timestamp = datetime.fromtimestamp(data["time"]).astimezone()
        seconds = max(0, int(data["time"] + 300 - time.time()))
        print(f"Scheduled {data['program']} at {timestamp:%Y-%m-%d %H:%M:%S %Z}. {seconds} seconds left to boot.")
    else:
        print("No program scheduled.")
    previous = read(history)
    if previous:
        print(f"Last boot: {previous['program']} · {previous['result']}")


def cleanup():
    """Delete the visible files and folders in the home directory (Tutorial 2).

    Hidden entries stay, so the SSH keys and the schedule state survive.
    """
    removed = 0
    for entry in Path.home().iterdir():
        if entry.name.startswith("."):
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry)
        else:
            entry.unlink()
        removed += 1
    print(f"Cleaned {removed} item(s) from {Path.home()}. Back up your work before the next cleanup.")


def boot():
    data = read(schedule)
    if not data:
        return
    # The Pi's virtual clock is set over UART even when the cable is unplugged.
    deadline = time.monotonic() + 15
    while not Path("/run/initio-lab/time-ready").is_file():
        if time.monotonic() >= deadline:
            return
        time.sleep(0.05)
    schedule.unlink()
    age = int(Path("/run/initio-lab/boot-time").read_text()) - data["time"]
    if not -1 <= age <= 300:
        save(history, {**data, "result": "five-minute window expired"})
        return
    master, slave = pty.openpty()
    try:
        child = subprocess.Popen([data["program"]], cwd=data["cwd"], stdin=slave, stdout=slave, stderr=slave)
    except OSError as error:
        save(history, {**data, "result": str(error)})
        os.close(master)
        return
    finally:
        os.close(slave)
    save(history, {**data, "result": "started"})
    try:
        while os.read(master, 4096):
            pass
    except OSError:
        pass
    finally:
        os.close(master)
    save(history, {**data, "result": f"exited with status {child.wait()}"})


if __name__ == "__main__":
    try:
        match sys.argv[1:]:
            case ["schedule", program]:
                record(program)
            case ["schedule"]:
                schedule.unlink(missing_ok=True)
                print("Autostart cleared.")
            case ["log"]:
                log()
            case ["cleanup"]:
                cleanup()
            case ["boot"]:
                boot()
            case _:
                sys.exit("Usage: rtcs schedule [program] | rtcs log | rtcs cleanup")
    except (ValueError, OSError) as error:
        sys.exit(str(error))
