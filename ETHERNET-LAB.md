# Initio Ethernet lab

Use **Virtual bench** to practise at home with an emulated Raspberry Pi 3 running Raspberry Pi OS and a simulated robot. Use **Physical bench** with an assigned Initio car, its Raspberry Pi, and an Ethernet cable. Both exercises use OpenSSH, SCP, and a native build on the Pi. The virtual bench uses an isolated QEMU link, and the physical bench uses your computer’s Ethernet port or USB Ethernet adapter.

## Virtual bench

Install Node.js 22 and Docker Desktop on macOS, or a local Docker Engine on Linux. Start Docker. In your computer’s Terminal, open the extracted lab folder and run:

```sh
npm ci
npm run setup:pi-os
npm run lab:ssh-config
npm run dev
```

The first Pi setup needs internet access and several GB of disk space. The separate `npm run setup:compiler` setup is for browser C compilation. For this exercise, GCC runs inside Raspberry Pi OS. The virtual SD card persists under `.initio-pi-os/`. If you are updating an existing lab, rerun Pi setup with the guest powered off to update its SSH configuration and keep your saved guest files.

Open http://127.0.0.1:5173/ and choose **Rehearse the Pi terminal**. Keep the Raspberry Pi OS lab and arena visible beside your Terminal throughout, as the browser supplies the virtual sensor readings. Leave the wheels on the stand, select **Connect Ethernet**, then **Power on Pi**. Wait for **SSH ready · 10.0.1.2**. An emulated first boot can take several minutes.

### Copy from your computer and log in

Open a second Terminal window in the extracted lab folder. The sample is a practice controller and Makefile, supplied in `examples/testIR`. Substitute your own source folder when ready.

```sh
scp -F .initio-pi-os/ssh_config -r examples/testIR e300user@10.0.1.2:
ssh -F .initio-pi-os/ssh_config e300user@10.0.1.2
```

The project-specific SSH configuration uses the generated key and pins the guest host key. Run the commands from the lab folder so OpenSSH finds the relative key paths. To type Tutorial 2’s exact plain `scp` and `ssh` commands, use the in-app Lab PC terminal and stage the practice source there first.

### Compile and test on the Pi

Run these after login:

```sh
hostname
uname -m
cat /etc/rpi-issue
ip -br -4 addr
cd ~/testIR
make test_compile
make testIR
file ./testIR
make run
```

Expect `raspberrypi`, `aarch64`, an interface with address `10.0.1.2/24`, and a 64-bit ARM ELF. Hold an object in front of the simulated sensors and remove it. Compare the IR bits in your SSH terminal with the motor percentages in the arena. The wheels should stop and resume while the stand holds the chassis. Press **q** in your SSH terminal to exit the controller.

### Practise losing the cable

With the controller stopped, select **Unplug Ethernet**. The shell should time out after a short delay. Try opening a new SSH connection while the cable is unplugged. Reconnect Ethernet, wait for SSH ready, and open a fresh SSH session. The compiled program is still on the virtual SD card.

To rehearse battery operation, log in, change to `~/testIR`, then run:

```sh
rtcs schedule testIR
rtcs log
sudo shutdown now
```

After **Cleanly shut down**, unplug Ethernet and DC, connect the battery, place the robot on the floor and power it on within five minutes of scheduling. The guest starts the scheduled program and the arena shows the robot moving while Ethernet stays unplugged. Power off to end the run. Return it to the stand, reconnect DC and Ethernet, and power on to debug. From the host, you can retrieve your guest source with:

```sh
scp -F .initio-pi-os/ssh_config e300user@10.0.1.2:testIR/testIR.c ./testIR-backup.c
```

## Physical bench

Use the assigned car’s existing course image, tutor-provided source and Makefile, and authorised login. Tutorial 2 shows `e300user@10.0.1.2` as an example. Confirm your car’s address, SSH host key and authentication with the tutor. The virtual configuration and key apply only to the emulated Pi.

1. Put the car on its stand so all tyres are off the ground. Connect its DC supply and an Ethernet cable between the Pi and the lab PC or Mac Ethernet adapter. Power on the Pi.
2. On the university PC, use the lab-provided network configuration. For a direct Mac-to-Pi link, if the tutor confirms that the assigned Pi uses `10.0.1.2/24`, set the wired service in **System Settings → Network → Ethernet → Details → TCP/IP** to **Manually** with IP address `10.0.1.1`, subnet mask `255.255.255.0`, and a blank router. Use the addresses supplied by the tutor if they differ. Keep this static configuration on the direct wired link and restore the adapter’s previous settings afterward.
3. In macOS Terminal, `route -n get 10.0.1.2` should show the wired interface. On Linux, use `ip route get 10.0.1.2`. If the connection fails, check link, subnet, Pi power and host key against the tutor’s details. A Mac may need an authorised SSH key or credentials even if the lab PC logs in automatically.
4. From the folder containing the lecturer’s `testIR/` project, run these on the host, substituting the assigned address as needed:

   ```sh
   scp -r testIR e300user@10.0.1.2:
   ssh e300user@10.0.1.2
   ```

5. At the Pi prompt, build with the course Makefile and use its documented run target or executable. Keep the wheels raised while you test IR stop and resume.

   ```sh
   cd ~/testIR
   make testIR
   file ./testIR
   make run
   ```

   If the program reports a GPIO permissions error, use the run procedure supplied by your tutor. Use the physical car’s observations to measure wheel direction, sensor coverage and stopping behaviour.

6. Exit the controller as instructed by the course program. Follow the tutor’s guidance for driving on the floor. Where the course image provides `rtcs`, the sequence in Tutorial 2 is `rtcs schedule testIR`, `rtcs log`, and `sudo shutdown now`, followed by a clean shutdown, cable change, and a battery boot within five minutes.

Tutorial 1 covers GCC basics, Tutorial 2 covers this network and bench workflow, Tutorial 3 extends the sensor tests, and Tutorial 4 moves to line following. For line following, use your own source folder, Makefile target, and executable names throughout the same copy → build → run sequence.
