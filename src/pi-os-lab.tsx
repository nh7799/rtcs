import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Cable, Cpu, Laptop, Play, Power, RotateCcw, Terminal } from 'lucide-react';
import { labProject, labSamples, robotAddress, type LabProject } from './lab-shell';
import { PcScreen } from './desk';
import type { Source } from './files';
import { linePracticeTrack } from './physics';
import type { Session } from './session';
import '@xterm/xterm/css/xterm.css';

type Board = {
  phase: 'off' | 'booting' | 'on' | 'stopping';
  ethernet: boolean;
  power: 'dc' | 'battery' | 'none';
  stand: boolean;
  sshReady: boolean;
  clean: boolean | null;
  error: string;
};
type Status = { ready: boolean; detail: string; state: Board };
type Message = { type: 'state'; state: Board } | { type: 'terminalReady' } | { type: 'error'; message: string } |
  { type: 'hardware'; pid: number; left: number; right: number; led: boolean };
type Props = {
  visible: boolean;
  files: Source[];
  active: string;
  session: Session;
  object: (show: boolean) => void;
  onComplete: () => void;
  onPower: (powered: boolean) => void;
};

const headers = { 'Content-Type': 'application/json' };

async function post<T>(route: string, value: unknown): Promise<T> {
  const response = await fetch('/api/pios/' + route, { method: 'POST', headers, body: JSON.stringify(value) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.diagnostics || 'The local Pi OS lab did not respond.');
  return result;
}

export function PiOsLab({ visible, files, active, session, object, onComplete, onPower }: Props) {
  const [status, setStatus] = useState<Status>();
  const [board, setBoard] = useState<Board>();
  const [terminalReady, setTerminalReady] = useState(false);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [folder, setFolder] = useState('');
  const mount = useRef<HTMLDivElement>(null);
  const controller = useRef(0);
  const subscribed = useRef({ onComplete, onPower });
  const boardRef = useRef<Board | undefined>(undefined);
  const fitRef = useRef<FitAddon | undefined>(undefined);
  subscribed.current = { onComplete, onPower };

  function applyBoard(next: Board) {
    boardRef.current = next;
    setBoard(next);
    session.placePiOs(next.stand);
    subscribed.current.onPower(next.phase !== 'off');
    if (next.phase === 'off') session.receivePiOs(0, [0, 0], false);
  }

  async function checkSetup() {
    setError('');
    try {
      const response = await fetch('/api/pios/status');
      if (!response.ok) throw new Error('Start the app locally with npm run dev to use the Pi OS terminal.');
      const result = await response.json() as Status;
      setStatus(result);
      applyBoard(result.state);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }

  useEffect(() => {
    void checkSetup();
  }, [session]);

  useEffect(() => {
    if (!status?.ready || !mount.current) return;
    const host = mount.current;
    const term = new XTerminal({
      fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, lineHeight: 1.15, scrollback: 1400,
      theme: { background: '#17271d', foreground: '#e1ecdf', cursor: '#a7d4a8', selectionBackground: '#4c6b52' },
      screenReaderMode: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fitRef.current = fit;
    const ws = new WebSocket(`ws://${location.host}/api/pios/terminal`);
    ws.binaryType = 'arraybuffer';
    let live = true;
    setOpening(true);
    setTerminalReady(false);
    function send(message: unknown) {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 32 * 1024) ws.send(JSON.stringify(message));
    }
    const disposeData = term.onData(data => send({ type: 'keys', data }));
    const disposeSize = term.onResize(({ cols, rows }) => send({ type: 'size', cols, rows }));
    const observer = new ResizeObserver(() => { if (host.clientWidth) fit.fit(); });
    observer.observe(host);
    const sendSensors = window.setInterval(() => {
      if (boardRef.current?.phase === 'on' || boardRef.current?.phase === 'booting') {
        send({ type: 'sensors', values: [...session.world.bits, Math.max(0, Math.min(1000, Math.round(session.world.distanceCm)))] });
      }
    }, 50);
    ws.onmessage = ({ data }) => {
      if (!live) return;
      if (data instanceof ArrayBuffer) { term.write(new Uint8Array(data)); return; }
      const message = JSON.parse(data) as Message;
      if (message.type === 'terminalReady') {
        setOpening(false);
        setTerminalReady(true);
        fit.fit();
        send({ type: 'size', cols: term.cols, rows: term.rows });
      } else if (message.type === 'state') applyBoard(message.state);
      else if (message.type === 'error') setError(message.message);
      else if (message.type === 'hardware') {
        session.receivePiOs(message.pid, [message.left, message.right], message.led);
        if (message.pid && !controller.current && boardRef.current?.stand === false) subscribed.current.onComplete();
        controller.current = message.pid;
      }
    };
    ws.onclose = event => {
      if (!live) return;
      setOpening(false);
      setTerminalReady(false);
      session.receivePiOs(0, [0, 0], false);
      if (event.code !== 1000) setError(previous => previous || event.reason || 'The lab terminal connection closed. Use Reopen terminal to retry.');
    };
    return () => {
      live = false;
      window.clearInterval(sendSensors);
      observer.disconnect();
      disposeData.dispose();
      disposeSize.dispose();
      ws.close();
      term.dispose();
      fitRef.current = undefined;
    };
  }, [status?.ready, retry, session]);

  useEffect(() => {
    if (visible && mount.current?.clientWidth) fitRef.current?.fit();
  }, [visible]);

  async function action(name: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try { applyBoard(await post<Board>('action', { action: name })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  async function stage(name: keyof typeof labSamples | 'workspace') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let project: LabProject;
      if (name === 'workspace') project = labProject(files, active);
      else {
        const sample = labSamples[name];
        const response = await fetch('/samples/' + sample.file);
        if (!response.ok) throw new Error('The tutorial source could not be loaded.');
        project = { name: sample.name, files: [{ name: sample.source, text: await response.text() }] };
      }
      const result = await post<{ folder: string }>('stage', project);
      setFolder(result.folder);
      setNotice(`Staged ~/${result.folder} on the lab PC. Type ls there to find it.`);
      if (boardRef.current?.phase === 'off' && name !== 'workspace' && name !== 'power') {
        const world = session.world;
        const track = name === 'line' ? linePracticeTrack(world.settings.track) : 'straight';
        world.settings = { ...world.settings, track };
        session.reset(null);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  }

  const project = folder || 'testIR';
  const powered = board?.phase !== 'off';
  const deskMode = document.body.classList.contains('desk');
  const bootLabel = board?.phase === 'booting' ? 'Booting Raspberry Pi OS…' : board?.phase === 'stopping' ? 'Powering down…' :
    board?.phase === 'on' ? 'Raspberry Pi OS running' : board?.clean ? 'Cleanly shut down' : 'Powered off';

  return <section id="pi-terminal" className="card lab-shell pi-os-lab" hidden={!visible} aria-labelledby="pi-os-heading">
    <div className="card-heading">
      <div className="heading-inline"><div className="section-icon"><Cpu size={20} /></div>
        <div><h2 id="pi-os-heading">Raspberry Pi OS lab</h2><p>Tutorial 2 · SSH to the car, build on the Pi, then test on the stand and floor.</p></div>
      </div>
      <span className="subtle-badge">PI 3 MODEL B</span>
    </div>
    {!status?.ready || !board ? <div className="pi-os-setup">
      <h3>Set up the virtual Pi’s SD card</h3>
      <p>Open Docker and run this once from your computer’s terminal. The setup downloads the official Raspberry Pi OS Lite image and prepares the lab user and Initio library.</p>
      <div className="toolbar"><code>npm run setup:pi-os</code><button className="btn" onClick={() => void checkSetup()}><RotateCcw size={14} /> Check setup</button></div>
      {error && <p role="alert" className="pi-os-error">{error}</p>}
    </div> : <>
      <div className="pi-os-hardware">
        <div className="lab-computer"><Laptop size={20} /><div><strong>Lab PC</strong><small>SPECSuser · Linux terminal</small></div></div>
        <div className="pi-os-link"><Cable size={18} /><span>{board.ethernet ? 'Ethernet connected' : 'Ethernet unplugged'}</span></div>
        <div className="lab-computer active-lab-computer"><Cpu size={20} /><div><strong>Initio’s Raspberry Pi</strong><small data-testid="pi-os-power">{bootLabel} · {board.stand ? 'Wheels raised' : 'On the floor'}</small></div></div>
      </div>
      <div className="toolbar pi-os-controls">
        <button className="btn" disabled={busy} onClick={() => void action('ethernet')}><Cable size={15} /> {board.ethernet ? 'Unplug Ethernet' : 'Connect Ethernet'}</button>
        <button className="btn" disabled={busy || powered || board.power === 'battery'} onClick={() => void action('dc')}>{board.power === 'dc' ? 'Disconnect DC' : 'Connect DC'}</button>
        <button className="btn" disabled={busy || powered || board.ethernet || board.power === 'dc'} onClick={() => void action('battery')}>{board.power === 'battery' ? 'Disconnect battery' : 'Connect battery'}</button>
        <button className="btn" disabled={busy || powered || (board.stand && board.power !== 'battery')} onClick={() => void action(board.stand ? 'floor' : 'desk')}>{board.stand ? 'Place on floor' : 'Return to stand'}</button>
        <button className={powered ? 'btn' : 'btn primary'} disabled={busy || board.phase === 'stopping' || board.power === 'none'} onClick={() => void action(powered ? 'off' : 'on')}><Power size={15} /> {powered ? 'Power off Pi' : 'Power on Pi'}</button>
      </div>
      <div className="pi-os-files">
        <strong>Stage source on the lab PC</strong>
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={() => void stage('obstacle')}>Use testIR practice</button>
          <button className="btn" disabled={busy} onClick={() => void stage('line')}>Use line-follower reference</button>
          <button className="btn" disabled={busy} onClick={() => void stage('power')}>Use powers of two</button>
          <button className="btn" disabled={busy || !files.length} onClick={() => void stage('workspace')}>Copy my C workspace</button>
        </div>
      </div>
      {(error || board.error) && <p className="pi-os-error pi-os-notice" role="alert">{error || board.error}</p>}
      {notice && <p className="pi-os-notice" role="status">{notice}</p>}
      <div className="lab-work pi-os-work">
        <div className="lab-console">
          <div className="lab-console-head"><Terminal size={15} /><span>Lab PC terminal</span><span data-testid="pi-ssh-status">{board.sshReady ? 'SSH ready · 10.0.1.2' : board.ethernet ? 'Waiting for SSH' : 'Ethernet unplugged'}</span></div>
          <div className="pi-os-terminal" ref={mount} aria-label="Lab PC and Raspberry Pi terminal" />
          {deskMode && location.search.includes('boot') && <PcScreen onOpen={() => requestAnimationFrame(() => fitRef.current?.fit())} />}
          {!terminalReady && <div className="pi-os-terminal-state">{opening ? 'Starting the Linux lab PC…' : <button className="btn" onClick={() => { setError(''); setRetry(value => value + 1); }}>Reopen terminal</button>}</div>}
        </div>
        <aside className="lab-guide">
          <div className="lab-next">
            <h3>Connect, copy and build</h3>
            <p>Connect Ethernet and switch on the Pi. Wait for SSH ready. Type each command in the terminal.</p>
            <pre className="pi-os-commands">{`scp -r ${project} ${robotAddress}:\nssh ${robotAddress}\ncd ${project}\nmake ${project}\nmake run`}</pre>
            <p>On the stand, test both front sensors and press <kbd>q</kbd> to quit the C program.</p>
            <div className="toolbar"><button className="btn" onClick={() => object(true)}>Hold object</button><button className="btn" onClick={() => object(false)}>Remove object</button></div>
          </div>
          <details className="lab-next">
            <summary>Use your own Terminal</summary>
            <p>Keep this lab open for the Ethernet controls, sensors and arena. From the project directory on your computer, run:</p>
            <pre className="pi-os-commands">{'npm run lab:ssh-config\nssh -F .initio-pi-os/ssh_config e300user@10.0.1.2'}</pre>
          </details>
          <div className="lab-next"><h3>Boot on battery</h3>
            <pre className="pi-os-commands">{`rtcs schedule ${project}\nrtcs log\nsudo shutdown now`}</pre>
            <p>Wait for clean shutdown. Unplug Ethernet and DC, attach the battery, place the car on the floor, then power on within five minutes.</p>
          </div>
        </aside>
      </div>
      <div className="lab-footer"><p><Play size={13} /> The car gets motor commands from the program running in Raspberry Pi OS.</p></div>
    </>}
  </section>;
}
