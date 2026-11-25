#!/bin/bash
set -euo pipefail
cd /boot/firmware/initio
exec >provision.log 2>&1
export DEBIAN_FRONTEND=noninteractive

printf '\nInstalling the native compiler and Initio bridge on Raspberry Pi OS.\n'
resize2fs /dev/mmcblk0p2
if compgen -G 'debs/*.deb' >/dev/null; then
    dpkg --unpack --force-confold debs/*.deb
    dpkg --configure -a
fi

id e300user >/dev/null 2>&1 || useradd -m -G sudo -s /bin/bash e300user
passwd -d e300user
install -d -o e300user -g e300user -m 700 /home/e300user/.ssh
install -o e300user -g e300user -m 600 authorized_keys /home/e300user/.ssh/authorized_keys
# Raspberry Pi OS regenerates its default ssh_host_* keys on first boot.
install -m 600 host_key /etc/ssh/initio_lab_ed25519_key
install -m 644 host_key.pub /etc/ssh/initio_lab_ed25519_key.pub
printf '%s\n' 'e300user ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/initio-lab
chmod 0440 /etc/sudoers.d/initio-lab
cat > /etc/ssh/sshd_config.d/10-initio-lab.conf <<'EOF'
HostKey /etc/ssh/initio_lab_ed25519_key
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin no
AllowUsers e300user
EOF
printf '%s\n' raspberrypi > /etc/hostname
grep -qxF '127.0.1.1 raspberrypi' /etc/hosts || printf '%s\n' '127.0.1.1 raspberrypi' >> /etc/hosts
term_profile='export TERM=${TERM:-xterm-256color}'
grep -qxF "$term_profile" /home/e300user/.profile || printf '%s\n' "$term_profile" >> /home/e300user/.profile
install -d -m 700 /etc/NetworkManager/system-connections
install -m 600 lab-ethernet.nmconnection /etc/NetworkManager/system-connections/

install -d /opt/initio-lab /usr/local/include /usr/local/lib /usr/local/bin
install -m 644 initio.h wiringPi.h softPwm.h /usr/local/include/
install -m 644 bridge.py /opt/initio-lab/
install -m 755 rtcs.py /usr/local/bin/rtcs
install -m 755 gcc.sh /usr/local/bin/gcc
/usr/bin/gcc -Wall -Wextra -Werror -fPIC -O2 -shared hardware.c -o /usr/local/lib/libinitio.so
ln -sf libinitio.so /usr/local/lib/libwiringPi.so
ldconfig
install -m 644 initio-bridge.service initio-autostart.service /etc/systemd/system/
systemctl unmask ssh.service
systemctl enable ssh.service initio-bridge.service initio-autostart.service
systemctl mask NetworkManager-wait-online.service systemd-timesyncd.service serial-getty@ttyAMA1.service
# The first-boot account wizard is handled by the local lab account above.
systemctl mask userconfig.service

printf 'int main(void) { return 0; }\n' > /tmp/initio-link-test.c
gcc -o /tmp/initio-link-test -Wall -Werror -linitio -lcurses -lwiringPi -lpthread /tmp/initio-link-test.c
/tmp/initio-link-test
printf 'Raspberry Pi OS, native GNU GCC and Initio bridge ready.\n'
touch READY
sync
