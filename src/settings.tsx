import type { Settings, World } from './physics';

type Numeric = Exclude<{ [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings], undefined>;
type Row = [key: Numeric, label: string, min: number, max: number, step: number, unit?: string];
const motor: Row[] = [
  ['width', 'Line width', 8, 55, 1, 'px'],
  ['friction', 'Tyre grip', 0.15, 1, 0.01],
  ['maxSpeed', 'Full-command speed', 0.2, 1.4, 0.05, 'm/s'],
  ['acceleration', 'Acceleration', 0.3, 3, 0.05, 'm/s²'],
  ['braking', 'Braking', 0.3, 5, 0.05, 'm/s²'],
  ['deadband', 'Motor deadband', 0, 35, 1, '%'],
  ['asymmetry', 'Right motor bias', -0.25, 0.25, 0.01],
  ['slip', 'Cornering slip', 0, 0.7, 0.01],
  ['axle', 'Effective axle width', 0.08, 0.26, 0.005, 'm'],
  ['wheelRadius', 'Wheel radius', 0.02, 0.05, 0.001, 'm'],
  ['dt', 'Simulation time step', 10, 50, 5, 'ms'],
];
const sensors: Row[] = [
  ['frontLeftRange', 'Front left range', 15, 230, 1, 'px'],
  ['frontRightRange', 'Front right range', 15, 230, 1, 'px'],
  ['frontSpread', 'Front IR spacing', 6, 50, 1, 'px'],
  ['frontForward', 'Front IR offset', 8, 46, 1, 'px'],
  ['floorSpread', 'Floor IR spacing', 6, 48, 1, 'px'],
  ['floorForward', 'Floor IR offset', 5, 46, 1, 'px'],
  ['threshold', 'Floor threshold', 0.08, 0.95, 0.01],
  ['noise', 'Floor noise amplitude', 0, 0.75, 0.01],
  ['latency', 'Sensor latency', 0, 400, 5, 'ms'],
];

export function SettingsPanel({ world, change, type }: { world: World; change: (patch: Partial<Settings>) => void; type: 'sensor' | 'physics' }) {
  const settings = world.settings;
  return <div className="settings-grid">
    {type === 'sensor' && <div className="checks">
      {([['leftInvert', 'Invert front left'], ['rightInvert', 'Invert front right'], ['floorInvert', 'Invert both floor sensors']] as const).map(([name, label]) =>
        <label key={name}><input type="checkbox" checked={settings[name]} onChange={event => change({ [name]: event.target.checked })} />{label}</label>)}
    </div>}
    {(type === 'sensor' ? sensors : motor).map(([key, label, min, max, step, unit]) =>
      <label className="setting" key={key}>
        <span>{label} <output>{settings[key]} {unit}</output></span>
        <input type="range" min={min} max={max} step={step} value={settings[key]} onChange={event => change({ [key]: Number(event.target.value) })} />
      </label>)}
    {type === 'sensor' && <label className="setting seed">Noise seed <input type="number" min={0} max={4294967295} value={settings.seed} onChange={event => change({ seed: Math.max(0, Math.min(4294967295, Math.floor(Number(event.target.value) || 0))) })} /></label>}
  </div>;
}
