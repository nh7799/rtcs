export const WIDTH = 880;
export const HEIGHT = 440;
export const BOT_RADIUS = 28;
export const OBSTACLE = { halfWidth: 21, halfHeight: 27 };
export const ZERO = [0, 0] as const;
export type Motors = readonly [number, number];
export type Bits = [number, number, number, number];
export type Point = { x: number; y: number };
export type Pose = Point & { heading: number };
export type Track = 'loop' | 'straight' | 'bend' | 'narrow' | 'gap' | 'lab-octagon';
export type Settings = {
  track: Track; width: number; dt: number; wheelRadius: number; axle: number;
  maxSpeed: number; acceleration: number; braking: number; friction: number;
  deadband: number; asymmetry: number; slip: number; noise: number; latency: number;
  threshold: number; floorSpread: number; floorForward: number; floorInvert: boolean;
  frontLeftRange: number; frontRightRange: number; leftInvert: boolean; rightInvert: boolean;
  frontSpread: number; frontForward: number; seed: number;
};
export const defaults: Settings = {
  track: 'loop', width: 36, dt: 20, wheelRadius: 0.033, axle: 0.15,
  maxSpeed: 0.7, acceleration: 1.25, braking: 2.8, friction: 0.87,
  deadband: 8, asymmetry: 0.03, slip: 0.22, noise: 0, latency: 20,
  threshold: 0.52, floorSpread: 24, floorForward: 22, floorInvert: false,
  frontLeftRange: 117, frontRightRange: 117, leftInvert: false, rightInvert: false,
  frontSpread: 22, frontForward: 28, seed: 402,
};
const PIXELS_PER_METRE = 300;
const TAU = Math.PI * 2;
export const trackNames: Record<Track, string> = {
  loop: 'Smooth loop', straight: 'Straight line', bend: 'Sharp bend', narrow: 'Narrow line', gap: 'Line gap',
  'lab-octagon': 'Lab Octagon',
};
const point = (x: number, y: number): Point => ({ x, y });
const loop = [
  point(276, 96), point(604, 96),
  ...Array.from({ length: 49 }, (_, i) => {
    const angle = -Math.PI / 2 + (i + 1) * Math.PI / 50;
    return point(604 + 122 * Math.cos(angle), 218 + 122 * Math.sin(angle));
  }),
  point(604, 340), point(276, 340),
  ...Array.from({ length: 49 }, (_, i) => {
    const angle = Math.PI / 2 + (i + 1) * Math.PI / 50;
    return point(276 + 122 * Math.cos(angle), 218 + 122 * Math.sin(angle));
  }),
  point(276, 96),
];
const straight = [point(108, 293), point(770, 293)];
const labOctagon = [
  point(194, 45), point(686, 45), point(744, 103), point(744, 337),
  point(686, 395), point(194, 395), point(136, 337), point(136, 103), point(194, 45),
];
export const paths: Record<Track, Point[][]> = {
  loop: [loop], straight: [straight], narrow: [straight],
  bend: [[point(108, 293), point(370, 293), point(470, 146), point(522, 293), point(770, 293)]],
  gap: [[point(108, 293), point(451, 293)], [point(568, 293), point(770, 293)]],
  'lab-octagon': [labOctagon],
};
export const linePracticeTrack = (current: Track): Track => current === 'lab-octagon' ? current : 'loop';
export const effectiveWidth = (s: Settings) => s.track === 'narrow' ? Math.min(s.width, 18) : s.width;
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const startPose = (s: Settings): Pose => s.track === 'lab-octagon'
  ? { x: 440, y: 45, heading: 0 }
  : { x: s.track === 'loop' ? 345 : 255, y: s.track === 'loop' ? 340 : 293, heading: 0 };
export const startObstacle = (s: Settings): Point => ({ x: s.track === 'loop' ? 609 : 628, y: startPose(s).y });
export function offset(p: Pose, ahead: number, left: number): Point {
  return point(p.x + Math.cos(p.heading) * ahead + Math.sin(p.heading) * left,
    p.y + Math.sin(p.heading) * ahead - Math.cos(p.heading) * left);
}
export function footprints(p: Pose, s: Settings) {
  return [
    offset(p, s.frontForward, s.frontSpread / 2), offset(p, s.frontForward, -s.frontSpread / 2),
    offset(p, s.floorForward, s.floorSpread / 2), offset(p, s.floorForward, -s.floorSpread / 2),
  ] as const;
}
function distanceToTrack(p: Point, track: Track) {
  let distance = Infinity;
  for (const path of paths[track]) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
      distance = Math.min(distance, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
    }
  }
  return distance;
}
export function reflectivity(p: Point, s: Settings) {
  const edge = distanceToTrack(p, s.track) - effectiveWidth(s) / 2;
  return 0.12 + 0.77 * clamp((edge + 2) / 4, 0, 1);
}
function rayDistance(p: Point, angle: number, range: number, obstacle: Point): number | null {
  let near = 0, far = range;
  const axes = [
    [p.x, Math.cos(angle), obstacle.x, OBSTACLE.halfWidth],
    [p.y, Math.sin(angle), obstacle.y, OBSTACLE.halfHeight],
  ];
  for (const [start, direction, center, half] of axes) {
    const low = center - half, high = center + half;
    if (Math.abs(direction) < 1e-9) {
      if (start < low || start > high) return null;
      continue;
    }
    const a = (low - start) / direction, b = (high - start) / direction;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}
export const FOV = 0.28;
export const FRONT_YAW = 0.10;
function frontHit(p: Point, angle: number, range: number, obstacle: Point | null) {
  return !!obstacle && [-1, -0.5, 0, 0.5, 1].some(fraction => rayDistance(p, angle + FOV * fraction, range, obstacle) !== null);
}
function collides(p: Point, obstacle: Point | null, margin = 0) {
  const radius = BOT_RADIUS + margin;
  if (p.x < radius || p.x > WIDTH - radius || p.y < radius || p.y > HEIGHT - radius) return true;
  if (!obstacle) return false;
  const dx = Math.max(0, Math.abs(p.x - obstacle.x) - OBSTACLE.halfWidth);
  const dy = Math.max(0, Math.abs(p.y - obstacle.y) - OBSTACLE.halfHeight);
  return Math.hypot(dx, dy) < radius;
}
const toward = (from: number, to: number, delta: number) => from + clamp(to - from, -delta, delta);
export type Trial = {
  label: string; speed: number; time: number; laps: number; lastLap: number | null;
  losses: number; stopping: number | null; collisions: number; seed: number; setup: string; forwardCommand?: number;
};

export class World {
  settings: Settings;
  pose: Pose;
  obstacle: Point | null;
  onStand = false;
  commands: Motors = ZERO;
  wheels: Motors = ZERO;
  bits: Bits = [0, 0, 1, 1];
  raw: Bits = [0, 0, 1, 1];
  blocked: [boolean, boolean] = [false, false];
  floor: [number, number] = [0.12, 0.12];
  distanceCm = 0;
  clock = 0;
  distance = 0;
  losses = 0;
  collisions = 0;
  collided = false;
  lost = false;
  laps = 0;
  lastLap: number | null = null;
  stopping: number | null = null;
  peakCommand = 0;
  private startedLap = 0;
  private checkpoint = 0;
  private brakeStart: number | null = null;
  private randomState = 1;
  private queue: { time: number; bits: Bits }[] = [];

  constructor(settings = defaults) {
    this.settings = { ...settings };
    this.pose = startPose(settings);
    this.obstacle = startObstacle(settings);
    this.reset();
  }

  reset(obstacle: Point | null = startObstacle(this.settings), pose = startPose(this.settings)) {
    this.pose = { ...pose };
    this.obstacle = obstacle ? { ...obstacle } : null;
    this.commands = this.wheels = ZERO;
    this.clock = this.distance = this.laps = this.losses = this.collisions = this.peakCommand = 0;
    this.stopping = this.brakeStart = this.lastLap = null;
    this.startedLap = this.checkpoint = 0;
    this.collided = this.lost = false;
    this.randomState = this.settings.seed >>> 0;
    this.sample(true);
  }

  moveRobot(p: Point) {
    const position = point(clamp(p.x, BOT_RADIUS, WIDTH - BOT_RADIUS), clamp(p.y, BOT_RADIUS, HEIGHT - BOT_RADIUS));
    if (!collides(position, this.obstacle)) {
      this.pose = { ...this.pose, ...position };
      this.wheels = ZERO;
      this.sample(true);
    }
  }

  placeObstacle(p: Point | null, immediate = true) {
    const placed = p && point(clamp(p.x, 25, WIDTH - 25), clamp(p.y, 28, HEIGHT - 28));
    if (!placed || !collides(this.pose, placed)) {
      this.obstacle = placed;
      this.sample(immediate);
    }
  }

  private random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  sample(immediate = false) {
    const s = this.settings;
    const [a, b, l, r] = footprints(this.pose, s);
    this.blocked = [
      frontHit(a, this.pose.heading - FRONT_YAW, s.frontLeftRange, this.obstacle),
      frontHit(b, this.pose.heading + FRONT_YAW, s.frontRightRange, this.obstacle),
    ];
    this.floor = [reflectivity(l, s), reflectivity(r, s)];
    const sonar = offset(this.pose, s.frontForward, 0);
    const distance = this.obstacle && rayDistance(sonar, this.pose.heading, 4 * PIXELS_PER_METRE, this.obstacle);
    this.distanceCm = distance === null ? 0 : Math.max(1, Math.round(distance * 100 / PIXELS_PER_METRE));
    const floorBits = this.floor.map(value => Number(value + (this.random() * 2 - 1) * s.noise < s.threshold) ^ Number(s.floorInvert));
    this.raw = [
      Number(this.blocked[0]) ^ Number(s.leftInvert),
      Number(this.blocked[1]) ^ Number(s.rightInvert),
      floorBits[0], floorBits[1],
    ];
    if (immediate) {
      this.queue = [];
      this.bits = this.raw;
      this.lost = this.floor.every(value => value >= s.threshold);
      return;
    }
    this.queue.push({ time: this.clock, bits: this.raw });
    while (this.queue.length && this.queue[0].time <= this.clock - s.latency + 1e-6) {
      this.bits = this.queue.shift()!.bits;
    }
  }

  tick() {
    const s = this.settings;
    const t = s.dt / 1000;
    const [left, right] = this.commands;
    this.peakCommand = Math.max(this.peakCommand, Math.abs(left), Math.abs(right));
    const target = (command: number, trim: number) => {
      const fraction = clamp((Math.abs(command) - s.deadband) / (100 - s.deadband), 0, 1);
      const angular = Math.sign(command) * fraction * (s.maxSpeed / defaults.wheelRadius) * trim;
      return angular * s.wheelRadius * (0.75 + 0.25 * s.friction);
    };
    const velocity = (previous: number, desired: number) => toward(previous, desired,
      t * (Math.abs(desired) < Math.abs(previous) || previous * desired < 0 ? s.braking : s.acceleration) * s.friction);
    this.wheels = [velocity(this.wheels[0], target(left, 1 - s.asymmetry)), velocity(this.wheels[1], target(right, 1 + s.asymmetry))];
    const speed = (this.wheels[0] + this.wheels[1]) / 2;
    const difference = this.wheels[0] - this.wheels[1];
    const omega = clamp(difference / s.axle * (1 - s.slip * (1 - s.friction + Math.min(0.7, Math.abs(difference)))), -8, 8);
    const midHeading = this.pose.heading + omega * t / 2;
    const next = {
      x: this.pose.x + speed * Math.cos(midHeading) * t * PIXELS_PER_METRE,
      y: this.pose.y + speed * Math.sin(midHeading) * t * PIXELS_PER_METRE,
      heading: (this.pose.heading + omega * t) % TAU,
    };
    const collision = !this.onStand && collides(next, this.obstacle);
    if (collision) {
      if (!this.collided) this.collisions++;
      this.wheels = ZERO;
    } else if (!this.onStand) {
      this.distance += Math.abs(speed) * t;
      this.pose = next;
    }
    this.collided = collision || (!this.onStand && this.collided && collides(next, this.obstacle, 6));
    if (!this.onStand && left === 0 && right === 0 && this.blocked.some(Boolean)) {
      if (this.brakeStart === null && Math.abs(speed) > 0.001) this.brakeStart = this.distance - Math.abs(speed) * t;
      if (this.brakeStart !== null && Math.abs(this.wheels[0]) + Math.abs(this.wheels[1]) < 0.002) {
        this.stopping = this.distance - this.brakeStart;
        this.brakeStart = null;
      }
    } else this.brakeStart = null;
    this.clock += s.dt;
    this.sample();
    const lost = this.floor.every(value => value >= s.threshold);
    if (lost && !this.lost) this.losses++;
    this.lost = lost;
    this.updateLap();
  }

  private updateLap() {
    const track = this.settings.track;
    if (track !== 'loop' && track !== 'lab-octagon') return;
    const { x, y } = this.pose;
    // Lab Octagon starts heading right on its top straight.
    const passed = track === 'lab-octagon'
      ? [x > 700, y > 365, x < 180, y < 75 && x > WIDTH / 2]
      : [x > 645, y < 135, x < 235, y > 300 && x > 345];
    if (passed[this.checkpoint]) this.checkpoint++;
    if (this.checkpoint === passed.length) {
      this.laps++;
      this.lastLap = (this.clock - this.startedLap) / 1000;
      this.startedLap = this.clock;
      this.checkpoint = 0;
    }
  }

  trial(label: string): Trial {
    return {
      label, speed: this.peakCommand, time: this.clock / 1000, laps: this.laps, lastLap: this.lastLap,
      losses: this.losses, stopping: this.stopping, collisions: this.collisions, seed: this.settings.seed,
      setup: JSON.stringify(this.settings),
    };
  }
}
