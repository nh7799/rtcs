import type { Source } from './files';

export const robotAddress = 'e300user@10.0.1.2';
export const labSamples = {
  obstacle: { title: 'Obstacle test', file: 'obstacle_practice.c', name: 'testIR', source: 'testIR.c' },
  line: { title: 'Line-follower practice', file: 'line_reference_practice.c', name: 'line_follower', source: 'line_follower.c' },
  power: { title: 'C basics', file: 'power.c', name: 'power', source: 'power.c' },
} as const;

export type LabProject = { name: string; files: Source[] };
export type LabBuild = { name: string; program: { kind: 'browser'; bytes: ArrayBuffer } | { kind: 'arm'; artifact: string; description: string } };
export type LabPosition = 'host' | 'stand' | 'floor';

export function labProject(files: Source[], active: string, name?: string): LabProject {
  const c = files.find(file => file.name === active && active.endsWith('.c')) ?? files.find(file => file.name.endsWith('.c'));
  if (!c) throw new Error('Open or upload a C program in the C workspace first.');
  const stem = c.name.split('/').at(-1)!.slice(0, -2);
  let copied = files.map(file => ({ ...file }));
  while (copied.every(file => file.name.includes('/') && file.name.split('/')[0] === copied[0].name.split('/')[0])) {
    copied = copied.map(file => ({ ...file, name: file.name.slice(file.name.indexOf('/') + 1) }));
  }
  return { name: name ?? (stem.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'controller'), files: copied };
}

export function terminalWords(command: string): string[] {
  if (command.length > 600 || /[\r\n`$;|&<>\\]/.test(command)) throw new Error('Enter a single lab command at a time.');
  const words = command.match(/"[^"]*"|'[^']*'|[^\s"']+/g) ?? [];
  if (command.replace(/"[^"]*"|'[^']*'/g, '').includes('"') || command.replace(/"[^"]*"|'[^']*'/g, '').includes("'")) {
    throw new Error('Close the quote around your filename.');
  }
  return words.map(word => word.replace(/^["']|["']$/g, ''));
}

export function makefilePreview(project: LabProject) {
  const provided = project.files.find(file => file.name === 'Makefile');
  if (provided) return provided.text;
  const sources = project.files.filter(file => file.name.endsWith('.c')).map(file => file.name).join(' ');
  return [
    '# Example lab targets. Use the supplied Makefile on the real car.',
    `${project.name}: ${sources}`,
    '\tgcc -Wall -o $@ $^ -linitio -lcurses -lwiringPi -lpthread',
    `run: ${project.name}`, `\t./${project.name}`,
    `schedule: ${project.name}`, `\trtcs schedule ${project.name}`,
  ].join('\n');
}

export function parseGcc(args: string[], project: LabProject) {
  const flagSet = new Set(['-Wall', '-Wextra', '-Werror', '-linitio', '-lcurses', '-lwiringPi', '-lpthread', '-fsyntax-only']);
  let name = 'a.out';
  const sources: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o') {
      name = args[++i] ?? '';
      if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,59}$/.test(name) || name.endsWith('.c') || name === 'Makefile') {
        throw new Error('Choose a new output name after -o, such as testIR.');
      }
    } else if (!flagSet.has(arg)) {
      const source = arg.replace(/^\.\//, '');
      if (!source.endsWith('.c') || !project.files.some(file => file.name === source)) throw new Error(`Unknown C file or GCC option: ${arg}`);
      sources.push(source);
    }
  }
  if (!sources.length) throw new Error('Include a C file, for example gcc -o power power.c.');
  return {
    name, syntaxOnly: args.includes('-fsyntax-only'), strict: args.includes('-Werror'),
    files: project.files.filter(file => !file.name.endsWith('.c') || sources.includes(file.name)),
  };
}
