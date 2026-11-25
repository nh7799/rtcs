import { lazy, StrictMode, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowRight, BookOpen, Box, Check, ChevronDown, CircleHelp, Code2,
  Crosshair, Download, Flag, Gauge, Globe2, Layers3, Map, Monitor, MousePointer2, Pause, Play, Plus, Radio,
  Radar, RotateCcw, ScanLine, Settings2, SkipForward, Square, Terminal, Timer, TriangleAlert, X,
} from 'lucide-react';
import { ArenaCanvas } from './arena';
import { Editor } from './editor';
import { Tutorial } from './tutorial';
import { LabTerminal } from './lab-terminal';
import type { LabBuild, LabPosition } from './lab-shell';
import { download, fromBase64, importFiles, readSaved, saveLocal, type Source } from './files';
import { migrateProgress, samples, steps, type Lesson, type Progress } from './lessons';
import { scenarios, scenarioSettings, type Scenario } from './course-scenarios';
import { Session } from './session';
import { defaults, linePracticeTrack, startObstacle, trackNames, type Settings, type Track, type Trial } from './physics';
import './styles.css';

const desk = new URLSearchParams(location.search).has('desk');
if (desk) document.body.classList.add('desk');
const PiOsLab = lazy(() => import('./pi-os-lab').then(module => ({ default: module.PiOsLab })));
const stageIcons = {
  start: BookOpen, c: Code2, connect: Globe2, terminal: Terminal, io: Radar,
  obstacle: Box, extensions: Radio, line: ScanLine, tune: Gauge, report: Flag,
};
const modeLabels = { paused: 'Paused', running: 'Running', stopped: 'Stopped', finished: 'Exited', fault: 'Stopped with error' };
function stored<T,>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function persist(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* keep the current session usable */ }
}
const seconds = (ms: number) => (ms / 1000).toFixed(2);
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function App() {
  const [session] = useState(() => new Session());
  const world = session.world;
  const [, redraw] = useReducer(n => n + 1, 0);
  const [stage, setStage] = useState<Lesson>(desk ? 'terminal' : 'start');
  const [complete, setComplete] = useState<Progress>(() => stored('initio:course-progress', migrateProgress(stored('initio:checklist', []))));
  const [trials, setTrials] = useState<Trial[]>(() => stored('initio:trials', []));
  const [saved] = useState(readSaved);
  const [files, setFiles] = useState<Source[]>(saved?.files ?? []);
  const [originals, setOriginals] = useState<Source[]>(saved?.originals ?? []);
  const [active, setActive] = useState(saved?.active ?? '');
  const [args, setArgs] = useState(saved?.args ?? '');
  const [origin, setOrigin] = useState(saved ? 'Saved on this computer' : '');
  const [build, setBuild] = useState('');
  const [compiler, setCompiler] = useState('Checking the local compiler…');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!!saved);
  const [notice, setNotice] = useState('');
  const [rays, setRays] = useState(true);
  const [tilt, setTilt] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [limit, setLimit] = useState(15);
  const [labVisited, setLabVisited] = useState(desk);
  const [fullPi, setFullPi] = useState(true);
  const [piPowered, setPiPowered] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const revision = useRef(0);
  const operation = useRef(0);
  const timer = useRef<number>(0);
  const trialEnd = useRef<number | null>(null);
  const trialSetup = useRef<unknown>(null);
  const labProgram = useRef(false);

  function flash(text: string) {
    setNotice(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(''), 3000);
  }

  useEffect(() => session.connect(() => {
    if (trialEnd.current !== null && session.mode === 'running' && session.world.clock >= trialEnd.current) {
      trialEnd.current = null;
      session.pause();
      flash('Trial duration reached.');
    }
    redraw();
  }), [session]);

  useEffect(() => {
    session.usePiOs(labVisited && fullPi && (stage === 'terminal' || piPowered));
  }, [session, labVisited, fullPi, stage, piPowered]);

  async function sample(name: string, initial = false, scenario?: Scenario) {
    const id = ++operation.current;
    ++revision.current;
    if (!initial) session.stop();
    setBusy(true);
    try {
      const [source, binary] = await Promise.all([fetch('/samples/' + name), fetch('/samples/' + name.replace(/\.c$/, '.wasm'))]);
      if (!source.ok) throw new Error('The practice source could not be loaded.');
      const data = [{ name, text: await source.text() }];
      const bytes = binary.ok ? await binary.arrayBuffer() : null;
      if (operation.current !== id) return;
      setFiles(data);
      setOriginals(data);
      setActive(name);
      setArgs(name === 'sum.c' ? '12 -5' : '');
      setOrigin(samples.find(item => item.file === name)?.detail || 'Practice sample');
      setDirty(false);
      setBuild(bytes ? 'Bundled WebAssembly ready. Select Run or Step.' : 'Source loaded. Select Compile to build WebAssembly locally.');
      if (scenario) applyScenario(scenario);
      else session.reset();
      labProgram.current = false;
      session.load(bytes);
      trialEnd.current = null;
      trialSetup.current = null;
      if (!initial) flash('Practice sample loaded.');
      return true;
    } catch (error) {
      if (operation.current === id) setBuild(String(error));
    } finally {
      if (operation.current === id) setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    fetch('/api/status').then(response => response.json()).then(status => {
      if (live) setCompiler(status.ready ? 'Local compiler ready · ' + status.detail : status.detail);
    }).catch(() => { if (live) setCompiler('Local compiler unavailable. Start the app with npm run dev on 127.0.0.1.'); });
    if (!saved) void sample('obstacle_practice.c', true);
    return () => {
      live = false;
      ++operation.current;
    };
  }, []);

  useEffect(() => {
    const receive = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (['g', 'p', 'q'].includes(event.key)) session.key(event.key);
    };
    window.addEventListener('keydown', receive);
    return () => window.removeEventListener('keydown', receive);
  }, [session]);

  function open(newStage: Lesson) {
    if (newStage === 'terminal') setLabVisited(true);
    setStage(newStage);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function changeSettings(patch: Partial<Settings>) {
    session.pause();
    world.settings = { ...world.settings, ...patch };
    if (patch.track) {
      trialEnd.current = null;
      trialSetup.current = null;
      session.reset();
    } else {
      world.sample(true);
      redraw();
    }
  }

  function sourceChanged() {
    ++revision.current;
    if (!dirty) {
      setDirty(true);
      setBuild('Source changed. Compile to run these edits.');
    } else if (build) setBuild('');
    if (!labProgram.current && session.canRun) session.load(null);
  }

  function edit(text: string) {
    sourceChanged();
    setFiles(old => old.map(file => file.name === active ? { ...file, text } : file));
  }

  async function upload(selection: File[]) {
    const id = ++operation.current;
    setBusy(true);
    try {
      const imported = await importFiles(selection);
      if (id !== operation.current) return;
      const onlyHeaders = imported.every(file => file.name.endsWith('.h'));
      const merge = onlyHeaders && files.length > 0;
      const replace = (current: Source[]) => {
        const next = merge ? current.filter(file => !imported.some(item => item.name.toLowerCase() === file.name.toLowerCase())).concat(imported) : imported;
        if (new Set(next.map(file => file.name.toLowerCase())).size !== next.length) throw new Error('Duplicate source filename.');
        if (next.length > 32 || next.reduce((total, file) => total + new TextEncoder().encode(file.text).length, 0) > 512 * 1024) throw new Error('Project source size or file count limit exceeded.');
        return next;
      };
      const updated = replace(files);
      const baseline = replace(originals);
      ++revision.current;
      setFiles(updated);
      setOriginals(baseline);
      setActive((imported.find(file => file.name.endsWith('.c')) || imported[0]).name);
      if (!merge) setArgs('');
      setOrigin(merge ? 'Current project with uploaded headers' : 'Uploaded source · original kept for restore');
      labProgram.current = false;
      session.load(null);
      setDirty(true);
      setBuild(`Imported ${imported.length} file${imported.length === 1 ? '' : 's'}. Select Compile when ready.`);
      flash('Source imported.');
    } catch (error) {
      if (id === operation.current) { setBuild(String(error)); flash('Import failed. See compiler output.'); }
    } finally {
      if (id === operation.current) setBusy(false);
    }
  }

  async function compile() {
    labProgram.current = false;
    setBusy(true);
    session.load(null);
    setBuild('Compiling with local Emscripten…');
    const version = revision.current;
    try {
      const response = await fetch('/api/compile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }),
      });
      const result = await response.json();
      if (version !== revision.current) return;
      setBuild(result.diagnostics);
      if (result.ok) {
        session.load(fromBase64(result.wasm));
        setDirty(false);
        flash('Compiled to WebAssembly.');
      } else flash('Compile failed. See compiler output.');
    } catch {
      if (version === revision.current) setBuild('The local compiler could not be reached. Open the app at http://127.0.0.1:5173 after npm run dev.');
    } finally { setBusy(false); }
  }

  function save() {
    try { saveLocal(files, originals, active, args); flash('Workspace saved in this browser.'); }
    catch { flash('Browser storage is full or unavailable. Export your project to save it.'); }
  }

  function setProgramArgs() {
    if (labProgram.current) return;
    const name = files.find(file => file.name.endsWith('.c'))?.name.split('/').at(-1)?.slice(0, -2) || 'program';
    session.args = [name, ...args.trim().split(/\s+/).filter(Boolean).slice(0, 16)];
  }

  function runProgram(restart = false) {
    if (restart) session.load(session.binary);
    setProgramArgs();
    session.run();
  }

  function launchLab(build: LabBuild, position: LabPosition, toolArgs: string[]) {
    trialEnd.current = null;
    trialSetup.current = null;
    const useLineTrack = position === 'floor'
      && (world.settings.track === 'lab-octagon' || /line/i.test(build.name));
    const track = useLineTrack ? linePracticeTrack(world.settings.track) : 'straight';
    world.settings = { ...world.settings, track };
    session.reset(null);
    labProgram.current = true;
    session.args = [build.name, ...toolArgs];
    if (build.program.kind === 'arm') session.loadPi(build.program.artifact, position === 'stand');
    else session.load(build.program.bytes, false, position === 'stand');
    session.run();
  }

  function labObject(show: boolean) {
    const { x, y, heading } = world.pose;
    world.placeObstacle(show ? { x: x + 110 * Math.cos(heading), y: y + 110 * Math.sin(heading) } : null, session.mode !== 'running');
    redraw();
  }

  function applyScenario(id: Scenario) {
    const { pose, obstacle } = scenarios[id];
    world.settings = { ...scenarioSettings };
    trialEnd.current = null;
    trialSetup.current = null;
    session.reset(obstacle, pose);
  }

  function toggleObstacle() {
    const immediate = session.mode !== 'running';
    if (world.obstacle) world.placeObstacle(null, immediate);
    else {
      const start = startObstacle(world.settings);
      world.placeObstacle(start, immediate);
      if (!world.obstacle) world.placeObstacle({ ...start, y: start.y - 75 }, immediate);
    }
    redraw();
  }

  function screenshot() {
    const image = canvas.current;
    if (!image) return;
    const composite = document.createElement('canvas');
    composite.width = image.width;
    composite.height = image.height + 42;
    const ctx = composite.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#17251c';
    ctx.fillRect(0, 0, composite.width, composite.height);
    ctx.drawImage(image, 0, 0);
    ctx.fillStyle = '#e6ecdf';
    ctx.font = '14px monospace';
    ctx.fillText(`SIMULATION ONLY  ·  ${trackNames[world.settings.track]}  ·  ${seconds(world.clock)} s`, 16, image.height + 25);
    composite.toBlob(blob => { if (blob) download(blob, 'initio-simulation.png'); });
  }

  function csv() {
    const columns: (keyof Trial)[] = ['label', 'forwardCommand', 'speed', 'time', 'laps', 'lastLap', 'losses', 'stopping', 'collisions', 'seed', 'setup'];
    const quote = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const rows = [
      'evidence,program,forward_command_pct,peak_command_pct,sim_seconds,laps,last_lap_seconds,line_losses,braking_distance_m,collisions,seed,configuration',
      ...trials.map(trial => ['SIMULATION ONLY', ...columns.map(key => trial[key])].map(quote).join(',')),
    ];
    download(new Blob([rows.join('\r\n')], { type: 'text/csv' }), 'initio-simulation-trials.csv');
  }

  function record() {
    if (world.clock === 0) return flash('Run or step the simulator before recording a trial.');
    const entry = world.trial(session.demo ? 'Demonstration' : files.filter(file => file.name.endsWith('.c')).map(file => file.name).join(' + '));
    const command = files.find(file => file.name === 'line_reference_practice.c')?.text.match(/^#define FORWARD_SPEED (\d+)\b/m)?.[1];
    const forwardCommand = !session.demo && !dirty && command !== undefined && Number(command) <= 100 ? Number(command) : undefined;
    const next = [...trials, { ...entry, forwardCommand, setup: JSON.stringify({ settings: world.settings, start: trialSetup.current, endObstacle: world.obstacle, sources: files.map(file => file.name) }) }].slice(-50);
    setTrials(next);
    persist('initio:trials', next);
    flash('Simulation trial recorded.');
  }

  function resetTrial() {
    session.reset(world.obstacle);
    trialEnd.current = limit * 1000;
    trialSetup.current = { pose: world.pose, obstacle: world.obstacle, durationSeconds: limit };
    flash(`Trial reset. Run to simulate ${limit} s.`);
  }

  const canRun = session.canRun && !busy;
  const completed = steps.filter(step => complete[step.id]).length;
  const current = steps.find(step => step.id === stage)!;
  const consoleLesson = !labProgram.current && (stage === 'c' || samples.some(sample => sample.file === active && sample.group === 'C fundamentals'));
  const sensorLab = stage === 'extensions' || files.some(file => file.name === 'sensor_extensions_practice.c');
  const detected = world.blocked.some(Boolean);
  const indicator = session.mode === 'running' ? 'running' : session.mode === 'fault' ? 'alarm' : 'idle';
  const sensors = [
    { name: 'Front left IR', code: 'FL', value: world.bits[0], status: world.blocked[0] ? 'Blocked' : 'Clear', type: world.blocked[0] ? 'warning' : 'clear' },
    { name: 'Front right IR', code: 'FR', value: world.bits[1], status: world.blocked[1] ? 'Blocked' : 'Clear', type: world.blocked[1] ? 'warning' : 'clear' },
    { name: 'Floor left IR', code: 'LL', value: world.bits[2], status: world.floor[0] < world.settings.threshold ? 'Dark surface' : 'Light surface', type: 'floor' },
    { name: 'Floor right IR', code: 'LR', value: world.bits[3], status: world.floor[1] < world.settings.threshold ? 'Dark surface' : 'Light surface', type: 'floor' },
  ];

  function completeLab() {
    if (complete.terminal) return;
    const next = { ...complete, terminal: true };
    setComplete(next);
    persist('initio:course-progress', next);
  }

  const lesson = <Tutorial key={stage} stage={stage} complete={!!complete[stage]} onCheck={() => {
          const next = { ...complete, [stage]: !complete[stage] };
          setComplete(next); persist('initio:course-progress', next);
        }} go={open} load={(name, target, scenario) => {
          void sample(name, false, scenario).then(loaded => { if (loaded) jump(target); });
        }} busy={busy} place={id => { applyScenario(id); jump('simulator'); }}
          world={world} change={changeSettings} trials={trials} onRecord={record} onTrial={resetTrial} onCsv={csv} onScreenshot={screenshot}
          limit={limit} setLimit={setLimit} reference={files.find(file => file.name === 'line_reference_practice.c')?.text}
          tune={(name, value) => {
            sourceChanged();
            setFiles(old => old.map(file => file.name === 'line_reference_practice.c' ? { ...file, text: file.text.replace(new RegExp(`^#define ${name} \\d+`, 'm'), `#define ${name} ${value}`) } : file));
          }} />;

  const workspace = <Editor key="workspace" files={files} originals={originals} active={active} origin={origin} build={build} output={session.terminal} compiler={compiler} busy={busy} dirty={dirty}
    switchFile={setActive} selectSample={name => void sample(name)} upload={selection => void upload(selection)} edit={edit} buildCode={() => void compile()}
    restore={() => { const baseline = originals.find(file => file.name === active); if (baseline) edit(baseline.text); }} save={save} keyInput={key => session.key(key)}
    consoleProgram={consoleLesson ? { args, setArgs, canRun: session.binary !== null && canRun, run: () => runProgram(true) } : undefined} />;

  return <>
    <header className="topbar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); open('start'); }}>
        <span className="brand-mark"><Crosshair size={23} /></span>
        <span><strong>Initio Lab</strong><small>RTCS COURSEWORK SIMULATOR</small></span>
      </a>
      <div className="top-actions">
        {import.meta.env.VITE_PROJECT_ZIP && <a className="btn preview-download" href={import.meta.env.VITE_PROJECT_ZIP} download><Download size={15} /> Project ZIP</a>}
        <span className="local-status" title={compiler}><span className="local-dot" /> Local lab</span>
        <button className="help" title="Open assignment overview" aria-label="Open assignment overview" onClick={() => open('start')}><CircleHelp size={20} /></button>
        <button className="mobile-toggle btn" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>Lab guide <ChevronDown size={16} /></button>
      </div>
    </header>
    <div className="layout">
      <aside className={mobile ? 'sidebar mobile-open' : 'sidebar'}>
        <div className="sidebar-top">
          <div className="nav-heading"><BookOpen size={15} /> LAB GUIDE</div>
          <nav aria-label="Coursework steps">
            {steps.map((step, i) => {
              const Icon = stageIcons[step.id];
              return <button key={step.id} className={step.id === stage ? 'nav-step active' : 'nav-step'} aria-current={step.id === stage ? 'step' : undefined} onClick={() => open(step.id)}>
                <span className={complete[step.id] ? 'step-number complete' : 'step-number'}>{complete[step.id] ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</span>
                <span className="step-copy"><strong>{step.title}</strong><small>{step.detail}</small></span>
                <Icon className="nav-icon" size={15} />
              </button>;
            })}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="progress-card">
            <div><strong>Lab progress</strong><span className="mono">{completed}/{steps.length}</span></div>
            <progress aria-label="Completed lab steps" value={completed} max={steps.length} />
            <p>{completed === 0 ? 'Start with the assignment overview.' : completed === steps.length ? 'All steps checked off.' : 'Your checklist is saved here.'}</p>
          </div>
          <div className="course"><Monitor size={16} /> <span>6COM2009 <span className="course-divider">/</span> RTCS CW1</span></div>
        </div>
      </aside>
      <main>
        <div className="page-intro">
          <div>
            <div className="crumb"><span>6COM2009</span><ArrowRight size={13} /><span>REAL-TIME AND CONTROL SYSTEMS</span></div>
            <h1>{stage === 'start' ? 'Virtual Initio Lab' : current.title}</h1>
            <p>{stage === 'start' ? 'From your first C program to the Autonomous Reliable Car demo.' : current.detail}</p>
          </div>
          <div className="intro-tools">
            <button className="btn intro-link" onClick={() => jump('simulator')}><Map size={15} /> Simulator <ArrowDownRight size={14} /></button>
            <button className="btn intro-link" onClick={() => jump('code-workspace')}><Code2 size={15} /> C workspace <ArrowDownRight size={14} /></button>
          </div>
        </div>
        {stage !== 'terminal' && lesson}
        {stage === 'terminal' && <div className="pi-os-modebar" role="group" aria-label="Pi lab mode">
          <button className={fullPi ? 'btn primary' : 'btn'} aria-pressed={fullPi} onClick={() => setFullPi(true)}>Raspberry Pi OS</button>
          <button className={fullPi ? 'btn' : 'btn primary'} aria-pressed={!fullPi} disabled={piPowered} onClick={() => setFullPi(false)}>Browser and ARM practice</button>
          {piPowered && <small>Power off the virtual Pi to switch modes.</small>}
        </div>}
        {labVisited && (fullPi ? <Suspense fallback={stage === 'terminal' ? <p>Loading the Pi OS terminal…</p> : null}>
          <PiOsLab visible={stage === 'terminal'} files={files} active={active} session={session} object={labObject} onComplete={completeLab} onPower={setPiPowered} />
        </Suspense> : <LabTerminal visible={stage === 'terminal'} files={files} active={active} session={session} launch={launchLab} object={labObject} onComplete={completeLab} />)}
        {stage === 'c' && workspace}
        <div id="simulator" className="dashboard">
          <section className="card arena-card" aria-labelledby="arena-heading">
            <div className="card-heading arena-head">
              <div className="heading-inline"><div className="section-icon"><Map size={19} /></div><div><h2 id="arena-heading">Simulation arena</h2><p>Drag the robot or obstacle to set up a run.</p></div></div>
              <div className="toolbar arena-options">
                <select aria-label="Track" value={world.settings.track} onChange={event => changeSettings({ track: event.target.value as Track })}>
                  {Object.entries(trackNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                </select>
                <button className={tilt ? 'btn icon-btn selected' : 'btn icon-btn'} title="Toggle angled view" aria-label="Toggle angled view" aria-pressed={tilt} onClick={() => setTilt(!tilt)}><Layers3 size={17} /></button>
                <button className={rays ? 'btn icon-btn selected' : 'btn icon-btn'} title="Toggle sensor rays" aria-label="Toggle sensor rays" aria-pressed={rays} onClick={() => setRays(!rays)}><Radar size={17} /></button>
              </div>
            </div>
            <div className="arena-scene">
              <ArenaCanvas world={world} tilt={tilt} rays={rays} canvas={canvas} running={session.mode === 'running'} changed={robot => { if (robot && session.mode === 'running') session.pause(); else redraw(); }} />
              <div className="arena-overlay"><span className="view-label"><span /> {world.onStand ? 'BENCH · WHEELS RAISED' : tilt ? 'ANGLED VIEW' : 'OVERHEAD VIEW'}</span><span className={'status-pill ' + indicator} data-testid="mode"><span /> {modeLabels[session.mode]}</span></div>
              <div className="arena-hint"><MousePointer2 size={13} /> Drag to reposition</div>
              <div className="arena-scale"><span /> 20 cm</div>
            </div>
            <div className="arena-tools">
              <div className="legend" aria-label="Arena legend"><span><i className="legend-bot" /> Initio</span><span><i className="legend-ir" /> Front IR</span><span><i className="legend-floor" /> Floor IR</span></div>
              <div className="toolbar small">
                <button className="icon-action" onClick={() => {
                  session.pause();
                  world.pose.heading += Math.PI / 12;
                  world.sample(true);
                  redraw();
                }} title="Rotate robot by 15 degrees"><RotateCcw size={14} /> Rotate</button>
                <button className="icon-action" onClick={toggleObstacle}>{world.obstacle ? <X size={15} /> : <Plus size={15} />}{world.obstacle ? 'Remove obstacle' : 'Add obstacle'}</button>
              </div>
            </div>
            <div className="transport">
              <div className="transport-left">
                {session.piOs ? <button className="btn" onClick={() => { open('terminal'); requestAnimationFrame(() => jump('pi-terminal')); }}><Terminal size={15} /> Control from Pi terminal</button> : <>
                {session.mode === 'running' ?
                  <button className="btn primary run-btn" onClick={() => session.pause()}><Pause size={16} fill="currentColor" /> Pause</button> :
                  <button className="btn primary run-btn" onClick={() => runProgram()} disabled={!canRun}><Play size={15} fill="currentColor" /> Run</button>}
                <button className="btn" onClick={() => { setProgramArgs(); session.step(); }} disabled={!canRun || session.mode === 'running'}><SkipForward size={16} /> Step</button>
                <button className="btn" onClick={() => session.stop()} disabled={session.mode === 'stopped'}><Square size={14} /> Stop</button>
                <button className="btn" onClick={() => {
                  trialEnd.current = null;
                  trialSetup.current = null;
                  session.reset();
                }}><RotateCcw size={15} /> Reset</button>
                </>}
              </div>
              <div className="transport-right">
                <span className="time-display" aria-label="Simulation time"><Timer size={16} /> <span data-testid="clock">{seconds(world.clock)} s</span></span>
                {!session.piOs && <select aria-label="Time scale" className="scale" value={session.scale} onChange={event => { session.scale = Number(event.target.value); redraw(); }}>
                  {[0.25, 0.5, 1, 2, 4].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
                </select>}
              </div>
            </div>
          </section>
          <div className="telemetry">
            <section className="card sensor-card" aria-labelledby="sensor-heading">
              <div className="card-heading">
                <div className="heading-inline"><div className="section-icon"><Activity size={19} /></div><div><h2 id="sensor-heading">Live sensors</h2><p>Digital inputs to C</p></div></div>
                <span className="subtle-badge"><span className="badge-dot" /> LIVE</span>
              </div>
              <div className="sensor-grid">
                {sensors.map(sensor => <div className={'sensor-cell ' + sensor.type} key={sensor.code}>
                  <div className="sensor-name"><span>{sensor.name}</span><code>{sensor.code}</code></div>
                  <strong data-testid={`sensor-${sensor.code}`}>{sensor.value}</strong>
                  <small><i />{sensor.status}</small>
                </div>)}
                {sensorLab && <div className="sensor-extensions">
                  <div><small>Ultrasonic distance</small><strong data-testid="sonar">{world.distanceCm ? `${world.distanceCm} cm` : '0 · no echo'}</strong></div>
                  <div><small>P37 LED</small><strong data-testid="p37"><i className={session.led ? 'led-on' : ''} />{session.led ? 'On' : 'Off'}</strong></div>
                </div>}
              </div>
              <button className="sensor-link" onClick={() => { open('io'); requestAnimationFrame(() => jump('calibration')); }}><Settings2 size={15} /> Sensor calibration <ArrowRight size={15} /></button>
            </section>
            <section className="card motor-card" aria-labelledby="motor-heading">
              <div className="card-heading">
                <div className="heading-inline"><div className="section-icon"><Gauge size={19} /></div><div><h2 id="motor-heading">Motor output</h2><p>Commanded power</p></div></div>
                <span className="subtle-badge">{session.piOs ? 'C / PI OS' : session.demo ? 'DEMO' : session.piArtifact ? 'C / ARM' : 'C / WASM'}</span>
              </div>
              <div className="motor-body">
                {world.commands.map((value, i) => <div className="motor-row" key={i}>
                  <div><span>{i === 0 ? 'Left motor' : 'Right motor'}</span><strong data-testid={i === 0 ? 'motor-left' : 'motor-right'}>{value}%</strong></div>
                  <progress aria-label={i === 0 ? 'Left motor command' : 'Right motor command'} value={Math.abs(value)} max={100} />
                </div>)}
                <div className={'motor-status' + (world.collided || detected || world.lost ? ' warn' : '')}>
                  {world.collided || detected || world.lost ? <TriangleAlert size={15} /> : <Activity size={15} />}
                  {world.collided ? 'Collision detected' : detected ? 'Obstacle in sensor range' : world.lost ? 'Both floor sensors off line' : 'Arena clear'}
                </div>
                <div className="motion-data">
                  <div><span>Wheel speed L / R</span><strong>{world.wheels[0].toFixed(2)} / {world.wheels[1].toFixed(2)} <small>m/s</small></strong></div>
                  <div><span>Sim. distance</span><strong>{world.distance.toFixed(2)} <small>m</small></strong></div>
                </div>
              </div>
            </section>
          </div>
        </div>
        {stage !== 'c' && workspace}
        <footer className="main-footer">
          <span>Run C in the browser practice or use Raspberry Pi OS for the coursework rehearsal.</span>
          <details><summary>Demonstration and defaults</summary><div className="footer-actions">
            <button className="btn" disabled={session.piOs} onClick={() => { labProgram.current = false; session.reset(); session.load(null, true); flash('Demonstration mode · scripted movement without C.'); }}>Load scripted demonstration</button>
            <button className="btn" onClick={() => { changeSettings(defaults); flash('Simulation defaults restored.'); }}>Restore model defaults</button>
          </div></details>
        </footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
