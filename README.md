# RTCS CW1 Virtual Initio Lab

A local Vite workspace for practising the 6COM2009 Autonomous Reliable Car coursework. The Pi terminal boots the official Raspberry Pi OS Lite image on a QEMU Pi 3. Copy, build and run C through a real SSH session to make the simulated Initio move. The C workspace can still compile and run WebAssembly, and the earlier 32-bit ARM/QEMU runtime is available for quick practice. All three runtimes feed the same simulated sensors and wheels.

The learning path uses the supplied Tutorial Sheets 1–4 and the 6COM2009 CW1 *Autonomous Reliable Car* brief. The app cites the relevant exercise or section in each lesson. The examples are authored for practice. Upload your lecturer’s `testIR.c`, `line_follower.c`, custom headers, or source ZIP when you want to work with the course files.

CW1 grading covers I/O Control, Obstacle Avoidance (stop and resume), and Line Follower (retain the stop rule). The three technical tasks carry 10 points each in the brief. Tutorial 3’s ultrasound, dark-floor stop and flashing LED are optional practice for CW1. Use evidence from the university car for real measurements and be ready to explain each statement in your submitted program.

## Ethernet and SSH lab

Follow [the Ethernet lab guide](ETHERNET-LAB.md) to use your computer’s Terminal with the virtual Pi, or to connect over a physical Ethernet cable to an assigned Initio. The virtual lab uses the same Raspberry Pi OS guest and arena whether you connect from the in-app terminal or your own Terminal.

## Mac app

Install Node.js 22 and Docker Desktop, then in this folder run `npm install`, `npm run setup:compiler` and `npm run setup:pi-os` once. After that, double-click **RTCS Lab.app** (keep it inside this folder; drag it to the Dock for quick access). If macOS blocks it, run `xattr -dr com.apple.quarantine "RTCS Lab.app"` once, or right-click it and choose Open. Logs go to `~/.rtcs-lab.log`. `npm run app` does the same from a terminal.

The window opens straight into the lab: the Linux PC terminal (`SPECSuser@lab-pc`), Ethernet, DC, battery, stand and power controls, and the arena. Add `boot` to the URL (`?desk=1&boot=1`) for the optional PC boot and login screen. This is a native window around the local app, not a code-signed standalone build.

## Run on macOS or Linux

Install Git, Python 3 and Node.js 22 LTS (or a supported Node.js version satisfying Vite's requirements). On Debian or Ubuntu, Git and Python 3 are available through `apt`. On macOS, Apple Command Line Tools or Homebrew can provide Git, and Homebrew can provide Python 3.

Open a terminal in the extracted `RTCS_CW1_Virtual_Initio_Lab` directory and run:

```sh
npm install
npm run setup:compiler
npm run dev
```

`npm run setup:compiler` is a one-time download from the official Emscripten SDK. It installs the pinned Emscripten 4.0.10 toolchain, including Binaryen, under `.initio-toolchain` in the project folder. The app finds it automatically in later terminal sessions. If you already have an Emscripten SDK, you can instead activate it in the same terminal before running `npm run dev`. Explicit `EMCC` and `WASM_OPT` executable paths are also supported.

Open **http://127.0.0.1:5173/**. Vite runs the interface and the local compiler API in the same process. Stop them with Ctrl+C. The app and bundled fonts work offline after setup. Bundled WebAssembly samples can run before installing the SDK.

```sh
npm run build
npm run preview
```

Open **http://127.0.0.1:4173/** for the built app and its local API. A generic static host can serve only the frontend and bundled samples. Keep the compiler bound to loopback.

## Rehearse the demo with Raspberry Pi OS

Install and start Docker Desktop on macOS or Docker Engine on Linux. Keep Docker on a local Unix socket. Open a terminal in this project folder. Run setup once with an internet connection and a few gigabytes of free disk space.

```sh
npm install
npm run setup:compiler
npm run setup:pi-os
npm run dev
```

`setup:compiler` enables the C workspace’s **Compile** button. `setup:pi-os` builds the lab container for your Docker engine’s CPU, then verifies and unpacks the official 64-bit Raspberry Pi OS Lite Bookworm image dated 6 October 2026. Its download is about 422 MiB. It prepares the local `e300user` account, native C libraries, and a persistent virtual SD card in `.initio-pi-os/`. The ZIP ships the installer and app source. The SD card, Docker images and local SSH keys stay on your computer.

Open **http://127.0.0.1:5173/** and choose **Rehearse the Pi terminal**. **Raspberry Pi OS** is the default mode. Select **Check setup** if the instructions still appear after setup. The terminal opens at `SPECSuser@lab-pc`. **Use testIR practice** puts `testIR.c` and a practice Makefile in `~/testIR` on that Linux PC. **Copy my C workspace** stages your current editor files and uses your Makefile when supplied. The Pi stores its own copy after `scp`.

### Copy, log in and build

1. With the car on the wooden stand, select **Connect Ethernet**, then **Power on Pi**. The Pi reads its virtual SD card. Wait for **SSH ready · 10.0.1.2**. Boot can take a minute or longer under emulation.
2. At the lab PC prompt, type:

   ```sh
   scp -r testIR e300user@10.0.1.2:
   ssh e300user@10.0.1.2
   ```

3. At the `e300user@raspberrypi` prompt, type:

   ```sh
   cd testIR
   make testIR
   file ./testIR
   make run
   ```

4. With the wheels raised, use **Hold object** and **Remove object**. Watch the motor commands stop and resume while the chassis stays in place. Focus the terminal and press **q** to quit C and return to the Pi shell. On the Pi, `cat /etc/rpi-issue`, `uname -m` and `ip -br -4 addr` show the OS image, ARM architecture, and assigned address. `nano` and `pwd` work directly in the Linux terminal.

`./testIR` also runs the built program. You can use Tutorial 2’s direct `gcc -o testIR -Wall -Werror -linitio -lcurses -lwiringPi -lpthread testIR.c` command in the guest. The tutorial-style C and Makefile compile using the native GNU compiler there. **Use line-follower reference** stages `line_follower` for the same workflow. With your own line follower, use the folder, target and executable names in the supplied Makefile.

### Schedule the floor run

Tutorial 2's `rtcs cleanup` is also available on the Pi. It deletes the visible files in `~` (hidden files such as SSH keys stay), so copy your work back with `scp` first.

From the Pi shell after quitting the bench test, type:

```sh
rtcs schedule testIR
rtcs log
sudo shutdown now
```

Wait for **Cleanly shut down**. Select **Unplug Ethernet**, **Disconnect DC**, **Connect battery**, **Place on floor**, then **Power on Pi** within five minutes of scheduling. The board boots again and systemd launches the scheduled guest executable. The car’s wheels now move it in the arena with the cable unplugged. Select **Power off Pi** to end the floor test, then return it to the stand and restore DC and Ethernet for debugging. Reconnect using the same `ssh` command. `rtcs log` shows the result of the previous scheduled boot. `rtcs schedule` with no argument clears the pending run.

### How the connection works

QEMU boots the distribution’s Pi kernel, initramfs and SD filesystem on a Raspberry Pi 3 Model B. The isolated lab PC uses OpenSSH and SCP through QEMU’s virtual Ethernet adapter. The Docker network has no outside route. The Ethernet control changes QEMU’s link state. The Initio bridge passes sensor readings and the native C program’s motor commands through the Pi’s emulated UART, which stays available on battery power. The physical cabling, sensors, motors and motion remain simulated. This lab uses the official OS with a configured account and compatible Initio library. In the university lab, follow your tutor’s handling instructions and use the assigned Pi, login, Makefile and hardware libraries.

The Pi keeps its files on the virtual SD card across restarts. The lab PC’s home folder lasts for the current app server session. You can copy files back with `scp -r e300user@10.0.1.2:testIR ./testIR-backup` while the Pi is connected. Keep your coursework source in your own workspace or export it from the C editor for a permanent copy.

## Browser and ARM practice

Choose **Browser and ARM practice** under **Rehearse the Pi terminal** to use the quick terminal. **Use testIR practice** stages the example on the virtual lab PC. **Use line-follower reference** stages a working practice controller. **Copy my C workspace** takes a snapshot of whatever C, headers and Makefile you currently have open. Copying it to the Pi creates a second snapshot. A host edit needs another copy and a Pi build before the Pi sees it. Use `nano`, **Ctrl+O** to save, and **Ctrl+X** to leave.

### Setup options

- **Browser C runtime** uses the existing Emscripten setup. It lets you learn the terminal sequence without Docker. A typed build command still compiles your C. The executable for this mode is WebAssembly.
- **Raspberry Pi ARM/QEMU** uses a local Docker Desktop or Docker Engine installation. Start Docker and run `npm run setup:pi` once from this folder. It builds an image with GNU make, ARM GCC and QEMU. Select **Check setup**, then **Raspberry Pi ARM/QEMU** in the app. That mode’s Pi build produces an ARMv7 Linux hard-float ELF. QEMU runs the ELF as an ARM user-space process with the simulator’s Initio, curses and wiringPi shims.

SSH, SCP, the account split, the stand, cable changes and power switching are simulated in both modes. The ARM target is a 32-bit Cortex-A7 profile. The container uses Debian build tools and QEMU user-mode CPU emulation. The Raspberry Pi OS boot sequence and the real board’s GPIO are represented by simulation. Check your assigned Pi’s architecture with `uname -m` in the physical lab and use the tutor’s source, Makefile and libraries there.

### Tutorial 1 first program

Choose **Use powers of two**. Type these lines one at a time at the lab PC prompt. The browser prints the result of the C program.

```sh
cd power
gcc -o power power.c
./power
```

Try `nano power.c` to change the limit, save it, then compile and run again. The rehearsal also accepts `gcc -fsyntax-only power.c`. The lab PC prompt uses the browser toolchain. The ARM option applies to builds and runs from the Pi prompt.

### Tutorial 2 bench and floor

Type these at the prompt one at a time. The account and IP are Tutorial 2’s examples. The first two commands run at the lab PC prompt. The rest run after SSH changes that prompt to the virtual Pi.

```sh
scp -r testIR e300user@10.0.1.2:
ssh e300user@10.0.1.2
cd testIR
uname -m
make testIR
file ./testIR
make run
```

The stand holds the chassis still while both wheels respond to the C commands. Use **Hold object** and **Remove object** to check stop and resume. Press **q** to end the C program. On the Pi, you can also type `./testIR`, or compare the tutorial’s direct GCC command.

```sh
gcc -o testIR -Wall -Werror -linitio -lcurses -lwiringPi -lpthread testIR.c
```

For the scheduled floor run, type the following from the virtual Pi shell after ending the bench program.

```sh
rtcs schedule testIR
rtcs log
sudo shutdown now
```

Use the buttons to disconnect Ethernet/DC, connect the battery, place the robot on the floor and switch on within five minutes. The schedule starts the build you selected and the arena allows motion. End the run with **Power off Pi**. Return to the desk and reconnect to practise again. You can clear the schedule by typing `rtcs schedule` without an executable. In the physical lab, follow the tutor’s handling instructions and confirm the actual robot’s login and IP.

### Bring your line follower through the same sequence

Stage the reference or your workspace. Use its folder and executable name in each command, such as `scp -r line_follower e300user@10.0.1.2:` and `make line_follower`. Try `make test_compile` to practise Tutorial 4’s syntax-only check. Consult your supplied Makefile for the actual target name. Test that obstacle stop takes priority over steering. Then schedule the floor run using the executable you built. Export the **source** for use with the real robot’s Makefile. ARM practice binaries contain simulated hardware functions.

The rehearsal accepts course commands and uses a fixed, packaged Makefile for ARM builds. `cat Makefile` shows the staged file or an example. This keeps uploaded recipes from executing on your computer. Native ARM runs are network-disabled, unprivileged containers with capped time, memory and output. Only local Docker sockets are accepted.

### Compile from your computer’s Terminal

After `npm run setup:pi`, build an ARM practice executable directly from your own terminal. Give a C file and any additional project `.c` and `.h` files as arguments. A syntax-only check uses `--syntax-only` before the file path.

```sh
mkdir -p practice
cp public/samples/obstacle_practice.c practice/testIR.c
npm run compile:pi -- practice/testIR.c
file practice/testIR-sim-armhf
```

The output file lives beside the source and can be inspected with `file`. Run and test the controller in the rehearsal. On the physical Pi, send your source and build it there with the tutor’s Makefile.

## Start from zero

1. **C from scratch · Tutorial 1.** On the first screen, select **Start with Tutorial 1**. Load **Powers of two**, then select **Run program** in the C workspace. Edit the loop limit and compile. Next, try the two macro placeholders, check bit 12, and use **Program arguments** with the sum exercise. The app passes space-separated values to the real `argc` and `argv` in C. Try valid, missing and malformed input. Bundled builds run before compiler setup.
2. **Lab workflow and I/O · Tutorial 2.** Rehearse which computer runs each copy, SSH, build and scheduling command. In **Read sensors and drive**, compare clear/blocked and light/dark inputs, use the PWM illustration, and change one motor command at a time.
3. **Test stop and resume · CW1 Section 2.** Load the obstacle practice (or compile the lecturer’s actual `testIR.c`). Use **Clear**, **Left blocked**, **Right blocked** and **Both blocked**. Predictions and explanations cover the both-clear condition, single-sensor coverage and the curses display. Remove the obstacle while running to see how the C loop resumes driving.
4. **Try extra sensors · Tutorial 3.** Load the sensor extension and test 130, 75 and 45 cm. Watch the 100%, 70% and 0% motor commands, and the virtual P37 status light. Edit `STOP_ON_DARK`, compile and place the robot over the tape. The preset sits beside the line so you can test a distance by itself.
5. **Build a line follower · Tutorial 4.** Use the worksheet’s starter when you have it, or load the practice template to work through the decisions. Test both floor sensors on tape, each side separately, both off tape, and obstacle priority. The completed simulation reference uses a lower rolling turn command. Follow Tutorial 4’s lab turning guidance and calibrate it on the physical robot.
6. **Tune and compare.** Load the reference, select **Smooth loop**, remove the obstacle, and set a trial length of 30 seconds. Select **Reset trial**, **Run**, and optionally **4×**. Record a baseline, change one speed setting in the C, compile, and repeat. The trials table and CSV record the forward constant for the bundled reference, peak motor command and outcomes. Try the sharp bend, narrow line or line gap to investigate lost feedback. The narrow preset caps tape width at 18 virtual pixels.
7. **Demo and report.** Practise the questions and review the individually written two-page report format, exact section names, appendix and Canvas submission. The verified file format details come from the CW1 brief.

A guided test position resets the model to its standard straight-track settings and pauses it at the selected pose. Your C files stay open while you switch test positions.

Use **Step** to advance one fixed simulation tick while paused. **Pause** freezes virtual time and zeros displayed actuator commands while preserving the C continuation and simulated wheel momentum for resume. **Stop** terminates the worker and zeros the simulated wheels. **Reset** also restores the track's starting pose and obstacle. **Reset trial** preserves obstacle placement and restores a standard start pose and seed. Key presses are delivered at C checkpoints. While paused, keys wait for **Step** or **Run**. The active C program determines whether it handles `g` and `p`.

The simulated stopping distance starts at the first zero-motor tick during a detected obstacle and ends when the wheels settle. A blank value means the measurement has yet to complete or there was no qualifying stop. Lap counting uses four ordered gates on the smooth loop. A line-loss event means both floor footprints newly crossed onto light floor. A collision remains one event until the car clears the contact area. The CSV labels all rows as simulation evidence. The report tab exports a labeled PNG of the arena.

## Upload, edit and reuse your code

- Use **Upload** for a C source and any headers, or a single project ZIP. Uploading headers by themselves adds or replaces those headers in the current project. The compiler builds all uploaded `.c` files together. A project needs exactly one entry point.
- A ZIP can contain `.c`, `.h`, and a `Makefile`, with nested directories. The app preserves the Makefile and original header text for export. The simulator ignores the Makefile and builds against its own Initio, curses and wiringPi compatibility headers. Mac ZIP metadata is ignored. If your archive contains binaries or extra files, upload just the C and headers.
- Use **Compile**, then **Run** or **Step**. Compiler output includes source locations. Matching errors and warnings are highlighted in the active file. Edits invalidate the previous build.
- **Save** stores the current project and original text in browser storage. **Diff** compares the current file with its baseline. **Restore original** restores that file. **Export** downloads the current file or a source ZIP. An unchanged UTF-8 file, including its BOM and original line endings, is preserved on export. On edit, line endings follow the file's detected convention.
- For the robot, export your final C and any custom headers. Copy them into your existing lab project with `scp`, keep the university's Makefile and hardware library headers, and build there with `make`. If the Makefile has a run target, use `make run`. Use the access details from your lecturer. Keep simulator shims and WebAssembly in the simulator. The virtual connection exercise illustrates this workflow.

Before the real demo, measure actual front/floor sensor polarity and offsets, motor direction, stopping distance and speed on your track. Verify stop and resume under appropriate supervision with clearance to stop the car. Use observations from the physical trials in the report. The simulation is suitable for rehearsing each C statement and testing decision branches before getting lab time.

## Model and C runtime

- A fixed step (20 ms default) updates wheel velocities toward commanded values. The model includes deadband, wheel radius, left/right bias, acceleration, braking and grip. Velocity is the mean of wheel velocities, and angular velocity is their difference divided by effective axle width, adjusted by slip and saturated. The pose integration uses midpoint heading and a nominal 300 virtual pixels per metre. Four wheels are rendered with two effective driven sides. The model approximates contact as a circular robot and rectangular obstacle. Friction is a tuning parameter, with no calibrated battery, energy, tyre or motor model.
- Floor reflectivity is sampled at two body-relative positions from the distance to the tape centreline. A threshold, seeded noise and configurable latency produce the bits. Front detections use five rays per sensor, adjustable range and independent inversion. Paused inspection refreshes the inputs immediately. Defaults are clear front IR = 0 and black floor = 1.
- C controls the two sides through `initio_Init`, `initio_Cleanup`, `initio_IrLeft`, `initio_IrRight`, `initio_IrLineLeft`, `initio_IrLineRight`, `initio_Stop`, `initio_DriveForward`, `initio_DriveReverse`, `initio_SpinLeft`, `initio_SpinRight` and `initio_TurnForward`. In this shim, `initio_TurnForward(left, right)` sets the corresponding wheel commands. Confirm this convention against the real library before transferring a controller. The Tutorial 3 bridge also supports `initio_UsGetDistance()`, `millis()`, and `pinMode`/`digitalWrite` for the simulated P37 LED. The distance is a geometric straight-ahead estimate in centimetres. Zero means no echo. Other pins, low-level GPIO, soft PWM, hardware peripherals and threading are outside this shim.
- `getch()` and `delay(ms)` suspend the actual C call stack through Binaryen's Asyncify pass. Simulated delays are rounded up to fixed-tick boundaries, with at least one step per checkpoint and a maximum requested delay of 60 seconds. A Web Worker resumes the C stack with fresh sensor bits and queued keys. The interface watchdog terminates a slice if it runs past 600 ms. A loop that calls neither checkpoint cannot drive the arena. Use one of the two functions inside a repeating control loop.
- The virtual curses screen implements `initscr`, `noecho`, `cbreak`, `nodelay`, `keypad`, `mvprintw`, `printw`, `getch`, `refresh`, `clear`, `erase` and `endwin` for text and key handling. It has 24 rows and clips long lines. Normal stdout/stderr also appear in the program terminal. A small WASI interface handles program arguments, terminal writes and exit. Other module imports are rejected. The **scripted demonstration** in the footer is a separate JavaScript mode for exploring the arena controls.

### Local compiler limits

Requests are same-origin and served only through the loopback app. A build uses one private temporary folder and one concurrent compiler job with argument arrays, output and file limits, and process-group timeouts. The browser compiler never runs a native upload or uploaded Makefile. In the Raspberry Pi OS lab, commands you type at the Pi prompt can build and run projects inside the guest, including your Makefile. ARM practice binaries are built locally and run through QEMU in a restricted Docker container. The WASM uses a fixed 4 MiB memory and provides no filesystem, network or JS interop imports. Uploads are bounded to 32 files, 128 KiB each, 512 KiB total and 1 MiB compressed ZIP size. Paths with traversal, absolute paths, links, conflicting names or unsupported file types are rejected.

The preprocessor accepts literal include paths inside the project plus an allowlist of standard and simulator headers. Macro includes, include probing, inline assembly, alternative directive spellings and line continuations are outside this compiler configuration. Arbitrary source can still exercise the local compiler and its dependencies. Compile code you trust. Use OS or container isolation for untrusted source.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Run is disabled after an upload or edit | Compile the current version first. Check Compiler output for the first error. |
| Compiler unavailable | Stop Vite with Ctrl+C, run `npm run setup:compiler` in the project folder, then run `npm run dev` again. If using an existing SDK, activate it first with `source /path/to/emsdk/emsdk_env.sh` in that same terminal. |
| Vite port already in use | Stop the other Vite process or run `npm run dev -- --port 5174` and open 127.0.0.1 on that port. |
| Pi OS setup is still shown | Start Docker, run `npm run setup:pi-os` from this project, and select **Check setup**. |
| SSH fails in the Pi OS terminal | Check that Ethernet is connected and the terminal shows **SSH ready** before using `ssh e300user@10.0.1.2`. Type the command at the lab PC prompt inside the app. |
| The Pi boots on battery with no motor output | On the bench, verify that `make run` drives the wheels, press `q`, check `rtcs log`, and let `sudo shutdown now` complete. Use the five-minute window from the schedule time to the power switch. |
| Multiple main definitions | Upload one controller entry point per project. |
| Missing hardware function | Look in `shim/initio.h` for supported calls. The terminal reports when an uploaded program depends on functions outside the shim. |
| Program stuck or watchdog fires | Add `getch()` or `delay(...)` inside the loop. Use `nodelay(stdscr, TRUE)` for a non-blocking key read. |
| The robot won't move | Read the motor bars and C terminal. Check obstacle range, floor polarity and the motor deadband. On a narrow tape, both footprints can see white when centred. |
| The robot overshoots a turn | Reduce the C forward command, then recompile. Test speed, grip and sensor latency separately. |

## Automated verification

```sh
npm test
npx playwright install chromium
npm run test:integration
npm run samples:build
```

The unit suite runs the bundled WASM in a test harness, checks sensor geometry and polarity, proves repeatable physics and a completed lap, and checks ZIP validation. The browser suite exercises real Emscripten compilation from uploaded source, changing a C condition, diagnostics with editor highlights, stop/resume, pause, `q`, the tight-loop watchdog, mobile layout, persistence and export round trips. Activate the SDK for the browser suite and sample builds. If Chromium is available through the operating system, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.

Development verification used Linux, Node 24, Emscripten 4.0.10, Binaryen 123 and Chromium. The Pi OS browser test boots the official image, authenticates through OpenSSH, copies and compiles `testIR`, checks the stand test, and confirms that the scheduled ARM executable runs after an unplugged battery boot. The test uses a temporary virtual SD overlay to protect saved guest files. The quick-practice tests cover WebAssembly and 32-bit ARM builds, sensor priority and the five-minute schedule. macOS and the lecturer’s actual source files remain to be verified with those inputs.

Screenshots of the running app are in `screenshots/`.
# rtcslab
# rtcs
