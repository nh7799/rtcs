"""Create the isolated lab PC's SSH configuration or stage a source folder."""
import json
from pathlib import Path
import os
import pwd
import shutil
import sys
import tempfile


def put_ssh(home, data):
    ssh = home / ".ssh"
    ssh.mkdir(mode=0o700, exist_ok=True)
    (ssh / "id_ed25519").write_text(data["clientKey"])
    (ssh / "known_hosts").write_text("10.0.1.2 " + data["hostKey"] + "\n")
    (ssh / "config").write_text("""Host 10.0.1.2 raspberrypi
    HostName 127.0.0.1
    Port 2222
    User e300user
    HostKeyAlias 10.0.1.2
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    ConnectTimeout 5
    ServerAliveInterval 2
    ServerAliveCountMax 2
""")


def stage(home, data):
    project = home / data["name"]
    if project.exists() or project.is_symlink():
        raise ValueError(f"{project.name} is already on the lab PC. Rename that folder in the terminal to stage a new copy.")
    temporary = Path(tempfile.mkdtemp(prefix=".source-", dir=home))
    try:
        for source in data["files"]:
            output = temporary / source["name"]
            if not output.is_relative_to(temporary) or ".." in output.relative_to(temporary).parts:
                raise ValueError("Invalid project path")
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(source["text"], encoding="utf-8")
        temporary.rename(project)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


os.umask(0o077)
home = Path(pwd.getpwuid(os.getuid()).pw_dir)
fields = json.load(sys.stdin)
try:
    if sys.argv[1:] == ["keys"]:
        put_ssh(home, fields)
    elif sys.argv[1:] == ["stage"]:
        stage(home, fields)
    else:
        raise ValueError("Expected keys or stage")
except (OSError, ValueError) as error:
    sys.exit(str(error))
