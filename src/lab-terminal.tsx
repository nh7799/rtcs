import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowRight, Battery, Cable, Check, Cpu, Download, Keyboard, Laptop, Power, RotateCcw, Terminal } from 'lucide-react';
import { exportZip, fromBase64, type Source } from './files';
import { labProject, labSamples, makefilePreview, parseGcc, robotAddress, terminalWords, type LabBuild, type LabPosition, type LabProject } from './lab-shell';
import type { Session } from './session';

type Location = 'host' | 'pi';
type Board = 'bench' | 'shutdown' | 'unplugged' | 'battery' | 'floor-ready' | 'floor-on' | 'floor-off';
type Target = 'browser' | 'arm';
type Edit = { on: Location; name: string; text: string };
type Run = { name: string; position: LabPosition; revision: number };
type Schedule = { name: string; at: number };
type Log = { text: string; command?: boolean };

type Props = {
  visible: boolean; files: Source[]; active: string; session: Session;
  launch: (build: LabBuild, position: LabPosition, args: string[]) => void;
  object: (show: boolean) => void; onComplete: () => void;
};

const windowMs = 5 * 60_000;
const headers = { 'Content-Type': 'application/json' };
const initialLog = [{ text: 'Lab PC terminal. Stage a project, then type the commands shown in the rehearsal guide.\nType help to list supported commands.' }];
const boardSteps: Record<Exclude<Board, 'bench'>, { label: string; next: Board }> = {
  shutdown: { label: 'Disconnect Ethernet and DC', next: 'unplugged' },
  unplugged: { label: 'Connect battery', next: 'battery' },
  battery: { label: 'Place robot on floor', next: 'floor-ready' },
  'floor-ready': { label: 'Power on Pi', next: 'floor-on' },
  'floor-on': { label: 'Power off Pi', next: 'floor-off' },
  'floor-off': { label: 'Return to desk and reconnect', next: 'bench' },
};

function prompt(machine: Location, inFolder: boolean, folder: string | undefined) {
  return `${machine === 'host' ? 'SPECSuser@lab-pc' : 'e300user@raspberrypi'}:${inFolder && folder ? '~/' + folder : '~'} $`;
}

export function LabTerminal({ visible, files, active, session, launch, object, onComplete }: Props) {
  const [host, setHost] = useState<LabProject | null>(null);
  const [pi, setPi] = useState<LabProject | null>(null);
  const [hostBuild, setHostBuild] = useState<LabBuild | null>(null);
  const [piBuild, setPiBuild] = useState<LabBuild | null>(null);
  const [machine, setMachine] = useState<Location>('host');
  const [hostFolder, setHostFolder] = useState(false);
  const [piFolder, setPiFolder] = useState(false);
  const [board, setBoard] = useState<Board>('bench');
  const [target, setTarget] = useState<Target>('browser');
  const [armStatus, setArmStatus] = useState<{ ready: boolean; detail: string } | null>(null);
  const [checkedStatus, setCheckedStatus] = useState(false);
  const initialCheckComplete = useRef(false);
  const [log, setLog] = useState<Log[]>(initialLog);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [buildInspected, setBuildInspected] = useState(false);
  const [benchRan, setBenchRan] = useState(false);
  const [benchTest, setBenchTest] = useState<'clear' | 'blocked' | 'resumed' | null>(null);
  const [floorRan, setFloorRan] = useState(false);
  const [scheduled, setScheduled] = useState<Schedule | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [scheduleChecked, setScheduleChecked] = useState(false);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(0);
  const screen = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const project = machine === 'host' ? host : pi;
  const inFolder = machine === 'host' ? hostFolder : piFolder;
  const build = machine === 'host' ? hostBuild : piBuild;
  const terminalPrompt = prompt(machine, inFolder, project?.name);
  const armBuild = piBuild?.program.kind === 'arm' ? piBuild : null;
  const isRunning = run && ['running', 'paused'].includes(session.mode);
  const blocked = session.world.blocked.some(Boolean);
  const motorsOn = session.world.commands.some(command => command !== 0);

  function write(text: string, command = false) {
    setLog(previous => [...previous, { text: text.slice(0, 12_000), command }].slice(-100));
  }

  async function refreshPi() {
    try {
      const response = await fetch('/api/pi/status');
      if (!response.ok) throw new Error();
      const status = await response.json();
      setArmStatus(status);
      if (!initialCheckComplete.current && status.ready) setTarget('arm');
    } catch {
      setArmStatus({ ready: false, detail: 'Start the local app with npm run dev to check the Pi toolchain.' });
    } finally {
      initialCheckComplete.current = true;
      setCheckedStatus(true);
    }
  }

  useEffect(() => {
    if (visible && !checkedStatus) void refreshPi();
  }, [visible, checkedStatus]);

  useEffect(() => {
    if (screen.current) screen.current.scrollTop = screen.current.scrollHeight;
  }, [log, run, session.terminal]);

  useEffect(() => {
    if (!scheduled) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((scheduled.at + windowMs - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [scheduled]);

  useEffect(() => {
    if (!run) return;
    if (session.programRevision !== run.revision || ['stopped', 'finished', 'fault'].includes(session.mode)) {
      write(session.terminal || `[${run.name} ended]`);
      setRun(null);
    } else if (run.position === 'floor' && session.world.clock > 0 && !floorRan) {
      setFloorRan(true);
      onComplete();
    } else if (run.position === 'stand' && session.mode === 'running') {
      if (!benchTest && !blocked && motorsOn) setBenchTest('clear');
      else if (benchTest === 'clear' && blocked && !motorsOn) setBenchTest('blocked');
      else if (benchTest === 'blocked' && !blocked && motorsOn) setBenchTest('resumed');
    }
  }, [run, session.programRevision, session.mode, session.terminal, session.world.clock, blocked, motorsOn, benchTest, floorRan, onComplete]);

  function useProject(next: LabProject) {
    if (run) session.stop();
    setHost(next);
    setPi(null);
    setHostBuild(null);
    setPiBuild(null);
    setScheduled(null);
    setBoard('bench');
    setMachine('host');
    setHostFolder(false);
    setPiFolder(false);
    setBuildInspected(false);
    setBenchRan(false);
    setBenchTest(null);
    setFloorRan(false);
    setRun(null);
    setLog([{ text: `Staged ~/${next.name} on the lab PC. The Pi has its own copy after scp.` }]);
    input.current?.focus();
  }

  async function chooseSample(key: keyof typeof labSamples) {
    setBusy(true);
    try {
      const sample = labSamples[key];
      const response = await fetch('/samples/' + sample.file);
      if (!response.ok) throw new Error('Practice source could not be opened.');
      useProject(labProject([{ name: sample.source, text: await response.text() }], sample.source, sample.name));
    } catch (error) { write(String(error)); }
    finally { setBusy(false); }
  }

  function saveEdit() {
    if (!edit) return;
    const original = edit.on === 'pi' ? pi : host;
    if (!original) return;
    const updated = { ...original, files: original.files.map(file => file.name === edit.name ? { ...file, text: edit.text } : file) };
    if (edit.on === 'pi') {
      setPi(updated);
      setPiBuild(null);
      setScheduled(null);
    } else {
      setHost(updated);
      setHostBuild(null);
    }
    write(`Saved ${edit.name} on ${edit.on === 'pi' ? 'the Pi' : 'the lab PC'}.`);
  }

  function nanoKeys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!event.ctrlKey || !['o', 'x'].includes(event.key.toLowerCase())) return;
    event.preventDefault();
    if (event.key.toLowerCase() === 'o') saveEdit();
    else setEdit(null);
  }

  async function compile(source: Source[], name: string, syntaxOnly = false, strict = false) {
    const isArm = machine === 'pi' && target === 'arm';
    if (!syntaxOnly) {
      if (machine === 'pi') { setPiBuild(null); setBuildInspected(false); setScheduled(null); }
      else setHostBuild(null);
    }
    setBusy(true);
    write(isArm ? 'Building with GNU make and ARM Linux GCC…' : 'Compiling C with local Emscripten…');
    try {
      const response = await fetch(isArm ? '/api/pi/build' : '/api/compile', {
        method: 'POST', headers, body: JSON.stringify({ files: source, syntaxOnly, strict }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.diagnostics || 'Build failed.');
      write(result.diagnostics);
      if (syntaxOnly) return;
      const compiled: LabBuild = {
        name,
        program: isArm ? { kind: 'arm', artifact: result.id, description: result.description }
          : { kind: 'browser', bytes: fromBase64(result.wasm) },
      };
      if (machine === 'pi') { setPiBuild(compiled); setBenchRan(false); setBenchTest(null); setFloorRan(false); }
      else setHostBuild(compiled);
      write(`Created ./${name} · ${isArm ? result.description : 'WebAssembly rehearsal build'}`);
    } catch (error) { write(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  function start(compiled: LabBuild, position: LabPosition, args: string[] = []) {
    if (position === 'stand') { setBenchRan(true); setBenchTest(null); }
    write(`Running ${compiled.name} in ${compiled.program.kind === 'arm' ? 'QEMU ARM Linux' : 'the browser C runtime'}.${position === 'stand' ? ' Wheels raised. Press q to return to the shell.' : ''}`);
    launch(compiled, position, args);
    setRun({ name: compiled.name, position, revision: session.programRevision });
  }

  function requireBuild(executable?: string) {
    if (!inFolder || !build || (executable && build.name !== executable)) throw new Error('Build the executable in this project directory first.');
    return build;
  }

  function schedule(executable?: string) {
    if (machine !== 'pi' || board !== 'bench') throw new Error('Schedule from the Pi SSH shell while the car is connected at the desk.');
    const selected = requireBuild(executable);
    setScheduled({ name: selected.name, at: Date.now() });
    setRemaining(300);
    setScheduleChecked(false);
    write(`${selected.name} scheduled. Switch on within five minutes. Check rtcs log before shutdown.`);
  }

  function advanceBoard() {
    if (board === 'bench') return;
    const step = boardSteps[board];
    setBoard(step.next);
    write(step.label + '.');
    if (step.next === 'floor-on') {
      const armed = scheduled && Date.now() - scheduled.at <= windowMs && scheduled.name === piBuild?.name;
      setScheduled(null);
      if (armed && piBuild) start(piBuild, 'floor');
      else write('Pi booted with no valid scheduled program. Return to the desk and schedule again.');
    }
    if (step.next === 'floor-off') session.stop();
  }

  function quit() {
    if (run?.position === 'floor') return write('Use the virtual power switch for the disconnected floor run.');
    if (session.mode === 'paused') return write('Resume the paused controller or use Stop in the arena.');
    session.key('q');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const line = value.trim();
    if (!line || busy) return;
    setValue('');
    history.current = [...history.current, line].slice(-40);
    historyIndex.current = history.current.length;
    if (isRunning) {
      if (line === 'q') quit();
      else write(run.position === 'floor' ? 'The robot runs independently on the floor. Use the power switch.' : 'The program has the terminal. Press q to return.');
      return;
    }
    write(terminalPrompt + ' ' + line, true);
    try {
      const [head, ...args] = terminalWords(line);
      if (head === 'help') return write('pwd · ls · cd · cat · nano · ssh · scp -r · gcc · make · file · ./program · rtcs schedule · rtcs log · rtcs cleanup · sudo shutdown now · exit · clear');
      if (head === 'clear') return setLog([]);
      if (head === 'pwd') return write(`/home/${machine === 'host' ? 'SPECSuser' : 'e300user'}${inFolder && project ? '/' + project.name : ''}`);
      if (head === 'ls') {
        if (!project) return write('(empty)');
        return write(inFolder ? [...new Set([...project.files.map(file => file.name), 'Makefile', ...(build ? [build.name] : [])])].join('\n') : project.name + '/');
      }
      if (head === 'cd') {
        const path = args[0]?.replace(/^~\//, '').replace(/\/$/, '');
        const home = !path || ['~', '..'].includes(path);
        if (!home && path !== '.' && path !== project?.name && path !== './' + project?.name) throw new Error('Directory unavailable. Use ls to find your project folder.');
        if (path !== '.') (machine === 'host' ? setHostFolder : setPiFolder)(!home);
        return;
      }
      if (head === 'ssh') {
        if (machine !== 'host') throw new Error('You are already in the Pi shell. Use exit to return to the lab PC.');
        if (args.join(' ') !== robotAddress) throw new Error(`Use the rehearsal address ${robotAddress}.`);
        if (board !== 'bench') throw new Error('The Pi is unavailable over Ethernet. Return it to the connected desk state.');
        setMachine('pi');
        setPiFolder(false);
        return write('Connected to the virtual Raspberry Pi. Use ls and cd to find the project.');
      }
      if (head === 'exit') {
        if (machine === 'pi') { setMachine('host'); return write('SSH session closed. Back on the lab PC.'); }
        return write('You are at the lab PC prompt.');
      }
      if (head === 'scp') {
        if (machine !== 'host' || board !== 'bench') throw new Error('Run scp on the lab PC while the Pi is connected at the desk.');
        if (args.length === 3 && args[0] === '-r' && pi && args[1] === robotAddress + ':' + pi.name && args[2] === '.') {
          setHost(labProject(pi.files, '', pi.name));
          setHostBuild(null);
          return write(`Copied ${pi.name}/ back to the lab PC.`);
        }
        if (!host || args.length !== 3 || args[0] !== '-r' || args[1]?.replace(/^~\//, '').replace(/\/$/, '') !== host.name ||
            ![robotAddress + ':', robotAddress + ':~'].includes(args[2])) {
          throw new Error(`From the lab PC home directory use scp -r ${host?.name || 'testIR'} ${robotAddress}:`);
        }
        if (hostFolder && !args[1].startsWith('~/')) throw new Error('Use cd ~ first or prefix the project path with ~/.');
        setPi(labProject(host.files, '', host.name));
        setPiBuild(null);
        setScheduled(null);
        setBenchRan(false);
        setBenchTest(null);
        setFloorRan(false);
        return write(`Copied ${host.files.length} source file(s) to the Pi. The Pi copy is ready to build.`);
      }
      if (head === 'uname' && args.join(' ') === '-m') return write(machine === 'pi' ? 'armv7l (32-bit virtual Raspberry Pi profile)' : 'x86_64 (virtual lab PC profile)');
      if (head === 'rtcs' && machine === 'pi') {
        if (args[0] === 'log' && args.length === 1) {
          setScheduleChecked(!!scheduled);
          return write(scheduled ? `${scheduled.name} · scheduled at ${new Date(scheduled.at).toLocaleTimeString('en-GB')} · ${remaining}s remaining` : 'No program scheduled.');
        }
        if (args[0] === 'schedule' && args.length === 1) { setScheduled(null); return write('Autostart cleared.'); }
        if (args[0] === 'schedule' && args.length === 2) return schedule(args[1].replace(/^\.\//, ''));
        if (args[0] === 'cleanup' && args.length === 1) {
          setPi(null); setPiBuild(null); setScheduled(null);
          setBenchRan(false); setBenchTest(null); setFloorRan(false);
          return write('Cleaned the car home directory. Copy your project over again with scp -r.');
        }
        throw new Error('Try rtcs schedule PROGRAM, rtcs log or rtcs cleanup.');
      }
      if (head === 'sudo') {
        if (machine !== 'pi' || args.join(' ') !== 'shutdown now') throw new Error('Use sudo shutdown now in the Pi shell for the floor-run rehearsal.');
        setBoard('shutdown');
        setMachine('host');
        return write('Pi shut down. SSH connection closed. Use the virtual cable and battery controls.');
      }
      if (!project || !inFolder) throw new Error('Use ls, then cd into the project directory.');
      if (head === 'cat' || head === 'nano') {
        const name = args[0]?.replace(/^\.\//, '');
        const file = project.files.find(item => item.name === name);
        if (head === 'cat' && name === 'Makefile') return write(makefilePreview(project));
        if (!file || (head === 'nano' && !/\.(c|h)$/.test(file.name))) throw new Error('Choose a C source or header listed by ls. Use cat Makefile to read the build targets.');
        if (head === 'cat') return write(file.text);
        setEdit({ on: machine, name: file.name, text: file.text });
        return;
      }
      if (head === 'file') {
        const compiled = requireBuild(args[0]?.replace(/^\.\//, ''));
        if (machine === 'pi') setBuildInspected(true);
        return write(compiled.name + ': ' + (compiled.program.kind === 'arm' ? compiled.program.description : 'WebAssembly binary, browser rehearsal'));
      }
      if (head === 'gcc') {
        const plan = parseGcc(args, project);
        return void await compile(plan.files, plan.name, plan.syntaxOnly, plan.strict);
      }
      if (head === 'make') {
        const rule = args.join(' ');
        if (['test_compile', 'test-compile', 'test compile'].includes(rule)) return void await compile(project.files, project.name, true);
        if (machine !== 'pi') throw new Error('The coursework Makefile builds on the Pi. Use ssh or try gcc for the Tutorial 1 exercise.');
        if (rule === 'run') return start(requireBuild(), 'stand');
        if (rule === 'schedule') return schedule();
        if (!rule || rule === project.name) return void await compile(project.files, project.name);
        throw new Error(`Unknown target. Try make ${project.name}, make run or make schedule.`);
      }
      if (head.startsWith('./')) return start(requireBuild(head.slice(2)), machine === 'pi' ? 'stand' : 'host', args.slice(0, 16));
      throw new Error('Command unavailable in this rehearsal. Type help.');
    } catch (error) { write(error instanceof Error ? error.message : String(error)); }
  }

  function promptKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'q' && value === '' && isRunning) {
      event.preventDefault();
      quit();
    } else if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      historyIndex.current = Math.max(0, Math.min(history.current.length, historyIndex.current + (event.key === 'ArrowUp' ? -1 : 1)));
      setValue(history.current[historyIndex.current] || '');
    }
  }

  const name = host?.name || 'testIR';
  const guide =
    board !== 'bench' ? { label: 'Floor handover', text: 'Use the board controls in order. On the floor, the battery supplies power and the PC has no SSH connection.' } :
    !host ? { label: 'Stage C files', text: 'Start with the obstacle example. It uses the same stop-and-resume rule as Tutorial 2.' } :
    name === 'power' && machine === 'host' ? {
      label: 'Compile your first C program', text: 'Tutorial 1 runs at the lab PC prompt. Build, then run the executable.',
      command: !hostFolder ? 'cd power' : !hostBuild ? 'gcc -o power power.c' : './power',
    } :
    machine === 'host' && !pi ? { label: 'Copy to the Pi', text: 'Run scp at the lab PC prompt. It copies the folder to the Pi home directory.', command: hostFolder ? 'cd ~' : `scp -r ${name} ${robotAddress}:` } :
    machine === 'host' ? { label: 'Connect with SSH', text: 'SSH changes the prompt to the Pi account.', command: 'ssh ' + robotAddress } :
    !piFolder ? { label: 'Find the project', text: 'On the Pi, use ls to confirm the copy, then enter the folder.', command: 'cd ' + (pi?.name || name) } :
    !piBuild ? { label: 'Compile by hand', text: 'Use make to build the executable. Try file to inspect the build afterwards.', command: 'make ' + (pi?.name || name) } :
    !buildInspected && !benchRan ? { label: 'Check the executable', text: 'Use file to inspect the artifact. ARM mode shows an actual 32-bit Linux ELF.', command: 'file ./' + piBuild.name } :
    !benchRan ? { label: 'Test with wheels raised', text: 'Run on the stand. Hold a virtual object in front, remove it, and press q after checking stop and resume.', command: 'make run' } :
    isRunning ? { label: 'Watch the motor response', text: 'Use Hold object and Remove object below. Press q to finish the bench run.' } :
    !scheduled ? { label: 'Schedule the floor run', text: 'Use the executable you just built. The schedule gives you five minutes to reboot.', command: 'rtcs schedule ' + piBuild.name } :
    !scheduleChecked ? { label: 'Check the schedule', text: 'Confirm the executable and the time left to reboot.', command: 'rtcs log' } :
    { label: 'Shut down the Pi', text: 'Shut down cleanly before changing cables.', command: 'sudo shutdown now' };

  return <section id="pi-terminal" className="card lab-shell" hidden={!visible} aria-labelledby="pi-heading">
    <div className="card-heading">
      <div className="heading-inline"><div className="section-icon"><Terminal size={19} /></div>
        <div><h2 id="pi-heading">Pi terminal rehearsal</h2><p>Tutorial 1 C basics · Tutorial 2 lab sequence · Tutorial 4 line follower</p></div>
      </div>
      <button className="btn" disabled={busy} onClick={() => {
        if (host) useProject(host);
        else { setValue(''); setLog(initialLog); }
      }}><RotateCcw size={14} /> Reset rehearsal</button>
    </div>

    <div className="lab-setup">
      <div className="lab-picker">
        <h3>Stage a project on the lab PC</h3>
        <div className="toolbar">
          <button className="btn primary" disabled={busy} onClick={() => void chooseSample('obstacle')}>Use testIR practice</button>
          <button className="btn" disabled={busy} onClick={() => void chooseSample('line')}>Use line-follower reference</button>
          <button className="btn" disabled={busy} onClick={() => void chooseSample('power')}>Use powers of two</button>
          <button className="btn" disabled={busy} onClick={() => { try { useProject(labProject(files, active)); } catch (error) { write(String(error)); } }}>Copy my C workspace</button>
        </div>
      </div>
      <div className="lab-target">
        <label>Pi execution mode
          <select value={target} disabled={!checkedStatus || busy || !!isRunning} onChange={event => {
            setTarget(event.target.value as Target);
            setPiBuild(null);
            setScheduled(null);
          }}>
            <option value="browser">Browser C runtime</option>
            <option value="arm" disabled={!armStatus?.ready}>Raspberry Pi ARM/QEMU</option>
          </select>
        </label>
        <button type="button" className="icon-action" title="Check the ARM toolchain again" onClick={() => void refreshPi()}><RotateCcw size={14} /> Check setup</button>
        <small>{armStatus?.detail || 'Checking for the Pi toolchain…'}</small>
      </div>
    </div>

    <div className="lab-computers">
      <div className={machine === 'host' ? 'lab-computer active-lab-computer' : 'lab-computer'}>
        <Laptop size={22} /><div><strong>Lab PC</strong><small>{host ? '~/' + host.name : 'Stage a project to begin'}</small></div>
      </div>
      <div className="lab-link"><ArrowRight size={18} /><small>{board === 'bench' ? 'Virtual Ethernet' : 'Disconnected'}</small></div>
      <div className={machine === 'pi' ? 'lab-computer active-lab-computer' : 'lab-computer'}>
        <Cpu size={22} /><div><strong>Raspberry Pi profile</strong><small>{pi ? '~/' + pi.name : 'Waiting for scp'} · ARMv7</small></div>
      </div>
    </div>

    <div className="lab-work">
      <div className="lab-console">
        <div className="lab-console-head"><Terminal size={15} /><span>{run?.position === 'floor' ? 'Pi floor program' : machine === 'pi' ? 'Pi SSH terminal' : 'Lab PC terminal'}</span>
          {busy && <span aria-live="polite">Working…</span>}
        </div>
        <div className="lab-log" ref={screen} aria-label="Terminal transcript" data-testid="lab-transcript">
          {log.map((entry, i) => <pre key={i} className={entry.command ? 'lab-command' : undefined}>{entry.text}</pre>)}
          {run && session.terminal && <pre data-testid="lab-program-output">{session.terminal}</pre>}
        </div>
        {edit ? <div className="lab-nano">
          <label>nano {edit.name}<textarea autoFocus value={edit.text} onChange={event => setEdit({ ...edit, text: event.target.value })} onKeyDown={nanoKeys} /></label>
          <div className="toolbar"><button className="btn" onClick={saveEdit}>Save (Ctrl+O)</button><button className="btn" onClick={() => setEdit(null)}>Exit (Ctrl+X)</button></div>
        </div> : <form className="lab-prompt" onSubmit={submit}>
          <label htmlFor="lab-command">{isRunning ? (run.position === 'floor' ? 'Floor program' : 'C program · q to quit') : terminalPrompt}</label>
          <input id="lab-command" aria-label="Terminal command" ref={input} autoComplete="off" spellCheck={false} value={value}
            placeholder={busy ? 'Working…' : 'Type a command'} onChange={event => setValue(event.target.value)} onKeyDown={promptKeys} disabled={busy} />
          <button type="submit" className="btn" disabled={busy || !value.trim()} aria-label="Enter command"><ArrowRight size={16} /></button>
        </form>}
      </div>

      <aside className="lab-guide" aria-label="Rehearsal instructions">
        <div className="lab-next">
          <h3>{guide.label}</h3><p>{guide.text}</p>
          {guide.command && <button type="button" className="lab-hint" disabled={busy || !!edit} title="Place this command in the prompt" onClick={() => {
            setValue(guide.command || ''); input.current?.focus();
          }}><code>{guide.command}</code><Keyboard size={16} /></button>}
        </div>
        <div className="lab-peripherals">
          <div><strong>{board === 'bench' ? 'Desk · wheels raised' : board === 'floor-on' ? 'Floor · battery power' : 'Pi powered off'}</strong>
            {scheduled && <small>Autostart window <span data-testid="pi-schedule">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span></small>}</div>
          {board !== 'bench' && <button className="btn primary" onClick={advanceBoard}>
            {board === 'floor-ready' || board === 'floor-on' ? <Power size={15} /> : board === 'unplugged' ? <Battery size={15} /> : <Cable size={15} />}{boardSteps[board].label}
          </button>}
          {run?.position === 'stand' && <div className="toolbar">
            <button className="btn" onClick={() => object(!blocked)}>{blocked ? 'Remove object' : 'Hold object'}</button>
            <button className="btn" onClick={quit}>Send q</button>
          </div>}
          {benchTest === 'resumed' && <p className="lab-passed"><Check size={15} /> Bench stop and resume observed</p>}
          {floorRan && <p className="lab-passed"><Check size={15} /> Scheduled floor program started</p>}
        </div>
      </aside>
    </div>
    <div className="lab-footer">
      <p>SSH, file copies and power changes stay inside the rehearsal. ARM/QEMU runs a 32-bit ARM Linux executable with simulated Initio hardware. Use the tutor’s Makefile and source on the physical Pi.</p>
      <div className="toolbar">
        {armBuild?.program.kind === 'arm' && <a className="btn" href={'/api/pi/artifact/' + armBuild.program.artifact} download><Download size={14} /> ARM practice binary</a>}
        {(pi || host) && <button className="btn" onClick={() => exportZip((pi || host)!.files)}><Download size={14} /> Export lab source</button>}
      </div>
    </div>
  </section>;
}
