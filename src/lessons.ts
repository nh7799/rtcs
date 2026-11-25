export const steps = [
  { id: 'start', title: 'Start here', detail: 'CW1 roadmap', source: 'CW1 brief, pp. 1–3', check: 'I can explain the three assessed outcomes.' },
  { id: 'c', title: 'C from scratch', detail: 'Tutorial 1 · C basics', source: 'Tutorial 1, exercises 1–6', check: 'I ran a C program, changed a macro and tested invalid input.' },
  { id: 'connect', title: 'Lab workflow', detail: 'Tutorial 2 · SSH to floor run', source: 'Tutorial 2, exercises 1–3', check: 'I can explain which commands run on the lab PC and which run on the robot.' },
  { id: 'terminal', title: 'Pi terminal rehearsal', detail: 'Copy, build, test and boot', source: 'Tutorial 1, exercise 1. Tutorial 2, exercises 1–3. Tutorial 4, exercises 1–2.', check: 'I practised the Pi build, bench test and scheduled floor run.' },
  { id: 'io', title: 'Read sensors and drive', detail: 'CW1 · I/O Control', source: 'Tutorials 2–3 and CW1 Section 1', check: 'I can explain the sensor functions, motor parameters and PWM.' },
  { id: 'obstacle', title: 'Test stop and resume', detail: 'CW1 · Obstacle Avoidance', source: 'Tutorial 2, exercise 2 and CW1 Section 2', check: 'I tested left-only, right-only, both blocked and clear.' },
  { id: 'extensions', title: 'Try extra sensors', detail: 'Tutorial 3 · Optional for CW1', source: 'Tutorial 3, exercises 1–4', check: 'I tried sonar thresholds, the dark floor detector and the P37 LED.' },
  { id: 'line', title: 'Build a line follower', detail: 'Tutorial 4 · CW1 Line Follower', source: 'Tutorial 4, exercises 1–2 and CW1 Section 3', check: 'I can explain every branch and show that obstacle stop comes first.' },
  { id: 'tune', title: 'Tune and compare', detail: 'Tutorial 4 · Speed and feedback', source: 'Tutorial 4, exercise 3 and CW1 Section 3', check: 'I compared two runs and can explain what the two sensors miss.' },
  { id: 'report', title: 'Demo and report', detail: 'CW1 · Evidence and submission', source: 'CW1 brief, pp. 1–3', check: 'I can explain my code and know what to verify on the real robot.' },
] as const;
export type Lesson = typeof steps[number]['id'];
export type Progress = Partial<Record<Lesson, boolean>>;

export const samples = [
  { file: 'obstacle_practice.c', title: 'Obstacle stop', detail: 'Tutorial 2 · Stop and resume', group: 'Robot controllers' },
  { file: 'line_template_practice.c', title: 'Line follower template', detail: 'Tutorial 4 · Practice template', group: 'Robot controllers' },
  { file: 'line_reference_practice.c', title: 'Completed line follower', detail: 'Tutorial 4 · Simulation reference', group: 'Robot controllers' },
  { file: 'sensor_extensions_practice.c', title: 'Sonar, floor sensor and P37', detail: 'Tutorial 3 · Optional CW1 practice', group: 'Robot controllers' },
  { file: 'power.c', title: 'Powers of two', detail: 'Tutorial 1 · Exercise 1', group: 'C fundamentals' },
  { file: 'macro_bits.c', title: 'Macros and bit 12', detail: 'Tutorial 1 · Exercises 2–3', group: 'C fundamentals' },
  { file: 'sum.c', title: 'Sum from arguments', detail: 'Tutorial 1 · Exercises 4–6', group: 'C fundamentals' },
] as const;
export type Sample = typeof samples[number]['file'];

export function migrateProgress(previous: boolean[]): Progress {
  const oldLessons: Lesson[] = ['start', 'connect', 'io', 'obstacle', 'line', 'tune', 'report'];
  return Object.fromEntries(oldLessons.map((id, index) => [id, !!previous[index]]));
}
