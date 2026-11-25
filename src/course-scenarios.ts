import { defaults, startPose, type Point, type Pose } from './physics';

const settings = { ...defaults, track: 'straight' } as const;
const pose = startPose(settings);
const atTrack = (dy = 0) => ({ ...pose, y: pose.y + dy });
const target = (dx: number, dy = 0) => ({ x: pose.x + dx, y: pose.y + dy });
const sonar = (cm: number): { pose: Pose; obstacle: Point } => ({
  pose: atTrack(-62),
  obstacle: target(settings.frontForward + 21 + cm * 3, -62),
});

export const scenarios = {
  clear: { label: 'Clear', pose, obstacle: null },
  'front-left': { label: 'Left blocked', pose, obstacle: target(111, -54) },
  'front-right': { label: 'Right blocked', pose, obstacle: target(111, 54) },
  'front-both': { label: 'Both blocked', pose, obstacle: target(111) },
  'line-both': { label: 'Both on tape', pose, obstacle: null },
  'line-left': { label: 'Left on tape', pose: atTrack(14), obstacle: null },
  'line-right': { label: 'Right on tape', pose: atTrack(-14), obstacle: null },
  'line-lost': { label: 'Both off tape', pose: atTrack(43), obstacle: null },
  'line-blocked': { label: 'Tape and obstacle', pose, obstacle: target(111) },
  'sonar-far': { label: '130 cm', ...sonar(130) },
  'sonar-near': { label: '75 cm', ...sonar(75) },
  'sonar-stop': { label: '45 cm', ...sonar(45) },
} as const;

export type Scenario = keyof typeof scenarios;
export const scenarioSettings = settings;
export const obstacleCases = ['clear', 'front-left', 'front-right', 'front-both'] as const;
export const lineCases = ['line-both', 'line-left', 'line-right', 'line-lost', 'line-blocked'] as const;
export const sonarCases = ['sonar-far', 'sonar-near', 'sonar-stop'] as const;
