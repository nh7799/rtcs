import { useEffect, useState } from 'react';
import { Power } from 'lucide-react';

const BOOT = ['GNU GRUB  version 2.06', ' *Ubuntu 22.04 LTS (RTCS lab image)', '  Windows Boot Manager', '',
  '[    0.000000] Linux version 6.5.0-generic', '[  OK  ] Started Network Manager', '[  OK  ] Mounted /home/SPECSuser',
  '[  OK  ] Reached target Graphical Interface', 'Starting display manager…'];
type Phase = 'off' | 'boot' | 'login' | 'desktop' | 'done';

/** Lab PC monitor: power button, boot, SPECSuser login, desktop, then the real terminal underneath. */
export function PcScreen({ onOpen }: { onOpen: () => void }) {
  const [phase, setPhase] = useState<Phase>('off');
  const [lines, setLines] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  useEffect(() => {
    if (phase !== 'boot') return;
    setLines([]);
    const timers = BOOT.map((line, i) => window.setTimeout(() => setLines(all => [...all, line]), 350 * (i + 1)));
    timers.push(window.setTimeout(() => setPhase('login'), 350 * (BOOT.length + 2)));
    return () => timers.forEach(id => window.clearTimeout(id));
  }, [phase]);
  if (phase === 'done') return null;
  return <div className="pc-screen" data-phase={phase}>
    {phase === 'off' && <button className="pc-power" onClick={() => setPhase('boot')}><Power size={28} /><span>Press the power button to switch on the lab PC</span></button>}
    {phase === 'boot' && <pre className="pc-boot">{lines.join('\n')}<span className="pc-cursor">▌</span></pre>}
    {phase === 'login' && <form className="pc-login" onSubmit={event => { event.preventDefault(); setPhase('desktop'); }}>
      <div className="pc-avatar">S</div><strong>SPECSuser</strong>
      <input type="password" autoFocus placeholder="Password (tutor gives it in the lab; anything works here)" value={password} onChange={event => setPassword(event.target.value)} aria-label="Password" />
      <button className="btn primary" type="submit">Log in</button>
    </form>}
    {phase === 'desktop' && <div className="pc-desktop">
      <div className="pc-panel"><span>Activities</span><span>SPECSuser@lab-pc</span><span>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
      <button className="pc-icon" onClick={() => { setPhase('done'); onOpen(); }}><span className="pc-term-glyph">&gt;_</span>Terminal</button>
    </div>}
  </div>;
}

type Scene = { ethernet: boolean; power: 'dc' | 'battery' | 'none'; stand: boolean; on: boolean };

/** Desk view: lab PC, Ethernet lead, and the Initio car on its stand with DC or battery. */
export function DeskScene({ ethernet, power, stand, on }: Scene) {
  const wheelY = stand ? 120 : 140;
  return <svg className="desk-scene" viewBox="0 0 640 200" role="img" aria-label={`Lab PC, Ethernet ${ethernet ? 'connected' : 'unplugged'}, car ${stand ? 'on the stand' : 'on the floor'}`}>
    <rect y="168" width="640" height="32" fill="#5b4329" />
    <rect x="30" y="36" width="130" height="92" rx="6" fill="#1b2430" stroke="#3a4a5c" />
    <rect x="38" y="44" width="114" height="76" fill="#0b1118" />
    <text x="95" y="86" textAnchor="middle" fill="#6fae7d" fontSize="11" fontFamily="monospace">SPECSuser</text>
    <rect x="86" y="128" width="18" height="40" fill="#2a3340" />
    {stand && <rect x="405" y="150" width="160" height="18" fill="#8a6a3d" />}
    <rect x="400" y="88" width="170" height="40" rx="8" fill="#2c6b4f" />
    <circle cx="430" cy={wheelY} r="16" fill="#111" /><circle cx="540" cy={wheelY} r="16" fill="#111" />
    <circle cx="552" cy="100" r="5" fill={on ? '#7cfc7c' : '#444'} />
    <text x="485" y="112" textAnchor="middle" fill="#dff5e6" fontSize="11" fontFamily="monospace">Initio · Raspberry Pi</text>
    {ethernet ? <path d="M160 110 C 240 170, 320 170, 400 110" stroke="#4aa3ff" strokeWidth="4" fill="none" />
      : <><path d="M160 110 q 28 20 40 52" stroke="#4aa3ff" strokeWidth="4" fill="none" /><path d="M400 110 q -28 20 -40 52" stroke="#4aa3ff" strokeWidth="4" fill="none" /></>}
    {power === 'dc' && <><path d="M500 88 V 30" stroke="#ddd" strokeWidth="3" /><rect x="480" y="14" width="40" height="18" rx="3" fill="#333" /><text x="500" y="27" textAnchor="middle" fill="#fff" fontSize="10">DC</text></>}
    {power === 'battery' && <rect x="450" y="70" width="52" height="18" rx="3" fill="#d9a441" />}
    <text x="280" y="196" textAnchor="middle" fill="#cbd5e1" fontSize="11">{ethernet ? 'Ethernet connected' : 'Ethernet unplugged'}</text>
  </svg>;
}
