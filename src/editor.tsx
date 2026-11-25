import { useEffect, useRef, useState } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { diffLines } from 'diff';
import { Check, Code2, Download, FileCode2, Files, GitCompare, Play, RotateCcw, Save, Terminal, Upload } from 'lucide-react';
import type { Source } from './files';
import { exportZip, download } from './files';
import { samples } from './lessons';

const theme = EditorView.theme({
  '&': { fontSize: '13px', height: '310px', backgroundColor: '#fdfdfa' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.72' },
  '.cm-gutters': { backgroundColor: '#f6f8f2', borderRight: '1px solid #e7eadf', color: '#798479' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 9px' },
  '.cm-content': { padding: '10px 0' },
  '.cm-line': { padding: '0 10px' },
  '.cm-activeLine': { backgroundColor: '#edf4e8' },
  '.cm-activeLineGutter': { backgroundColor: '#e5eddf' },
  '&.cm-focused': { outline: '2px solid #96ae96', outlineOffset: '-2px' },
});

function Code({ source, diagnostics, onChange }: { source: Source; diagnostics: string; onChange: (text: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const reflecting = useRef(false);
  const lineEnding = useRef(source.text.includes('\r\n') ? '\r\n' : source.text.includes('\r') ? '\r' : '\n');
  useEffect(() => {
    if (!container.current) return;
    view.current = new EditorView({
      doc: source.text,
      extensions: [basicSetup, cpp(), theme, EditorView.contentAttributes.of({ 'aria-label': 'C source editor' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !reflecting.current) change.current(update.state.doc.toString().replace(/\n/g, lineEnding.current));
        }),
      ],
      parent: container.current,
    });
    return () => view.current?.destroy();
  }, []);
  useEffect(() => {
    const editor = view.current;
    const text = source.text.replace(/\r\n?/g, '\n');
    if (editor && editor.state.doc.toString() !== text) {
      reflecting.current = true;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
      reflecting.current = false;
    }
  }, [source.text]);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const doc = editor.state.doc;
    const marks: Diagnostic[] = [];
    for (const match of diagnostics.matchAll(/^(.+?):(\d+):(\d+):\s*(error|warning|fatal error):\s*(.+)$/gm)) {
      if (match[1].trim().replace(/^\.\//, '') !== source.name) continue;
      const number = Number(match[2]);
      if (number < 1 || number > doc.lines) continue;
      const line = doc.line(number);
      const from = Math.min(line.to, line.from + Math.max(0, Number(match[3]) - 1));
      marks.push({ from, to: Math.min(line.to, from + 1), severity: match[4] === 'warning' ? 'warning' : 'error', message: match[5] });
    }
    editor.dispatch(setDiagnostics(editor.state, marks));
  }, [diagnostics, source.name]);
  return <div ref={container} />;
}

export function Editor({ files, originals, active, origin, build, output, compiler, busy, dirty, switchFile, selectSample, upload, edit, buildCode, restore, save, keyInput, consoleProgram }: {
  files: Source[]; originals: Source[]; active: string; origin: string;
  build: string; output: string; compiler: string; busy: boolean; dirty: boolean;
  switchFile: (name: string) => void; selectSample: (file: string) => void; upload: (files: File[]) => void;
  edit: (text: string) => void; buildCode: () => void; restore: () => void; save: () => void; keyInput: (key: string) => void;
  consoleProgram?: { args: string; setArgs: (args: string) => void; canRun: boolean; run: () => void };
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [diff, setDiff] = useState(false);
  const [terminal, setTerminal] = useState<'build' | 'program'>('build');
  const source = files.find(file => file.name === active);
  const original = originals.find(file => file.name === active);
  return <section className="card editor-card" id="code-workspace" aria-labelledby="code-heading">
    <div className="card-heading editor-head">
      <div className="heading-inline"><div className="section-icon"><Code2 size={19} /></div><div>
        <h2 id="code-heading">C workspace</h2><p>Edit and compile C programs for the tutorials and robot.</p>
      </div></div>
      <div className="toolbar">
        <select aria-label="Practice sample" value="" onChange={event => { if (event.target.value) selectSample(event.target.value); }} disabled={busy}>
          <option value="">Practice samples</option>
          {(['C fundamentals', 'Robot controllers'] as const).map(group => <optgroup label={group} key={group}>
            {samples.filter(sample => sample.group === group).map(sample => <option key={sample.file} value={sample.file}>{sample.title}</option>)}
          </optgroup>)}
        </select>
        <input type="file" hidden multiple accept=".c,.h,.zip" ref={picker} onChange={event => {
          const selection = Array.from(event.target.files || []);
          if (selection.length) upload(selection);
          event.target.value = '';
        }} aria-label="Upload C project" />
        <button className="btn" disabled={busy} onClick={() => picker.current?.click()}><Upload size={15} /> Upload</button>
        <button className="btn primary" disabled={busy || !files.some(file => file.name.endsWith('.c'))} onClick={() => { setTerminal('build'); buildCode(); }}><Code2 size={16} />{busy ? 'Working…' : 'Compile'}</button>
      </div>
    </div>
    <div className="editor-body">
      <aside className="explorer" aria-label="Source files">
        <div className="explorer-title"><Files size={15} /> Files</div>
        {files.map(file => <button key={file.name} className={active === file.name ? 'file selected-file' : 'file'} title={file.name} onClick={() => switchFile(file.name)}>
          <FileCode2 size={15} /><span>{file.name}</span>
        </button>)}
        {origin && <div className="source-note">{origin}</div>}
      </aside>
      <div className="editor-main">
        <div className="file-actions">
          <span className="mono active-file" title={active}>{active || 'No file open'}</span>
          <div className="toolbar small">
            <button className="icon-action" disabled={!source} onClick={save} title="Save to this browser"><Save size={15} /> Save</button>
            <button className="icon-action" disabled={!original || source?.text === original.text} onClick={restore} title="Restore uploaded or starter text"><RotateCcw size={15} /> Restore original</button>
            <button className={diff ? 'icon-action on' : 'icon-action'} disabled={!source} onClick={() => setDiff(!diff)} aria-pressed={diff}><GitCompare size={15} /> Diff</button>
            <details className="export-menu"><summary className="icon-action"><Download size={15} /> Export</summary>
              <div className="menu-pop">
                <button disabled={!source} onClick={() => source && download(new Blob([source.text], { type: 'text/plain' }), source.name.split('/').at(-1)!)}>Current file</button>
                <button disabled={!files.length} onClick={() => exportZip(files)}>Project ZIP</button>
              </div>
            </details>
          </div>
        </div>
        {source && (diff ? <pre className="diff-view">{source.text === original?.text ? 'No changes from the original.' :
          diffLines(original?.text || '', source.text).map((part, i) => <span key={i} className={part.added ? 'add' : part.removed ? 'remove' : ''}>{part.value}</span>)}</pre> :
          <Code key={source.name} source={source} diagnostics={build} onChange={edit} />)}
        {!source && <div className="empty-editor">Load a practice sample or upload a C project.</div>}
      </div>
    </div>
    {consoleProgram && <div className="program-inputs">
      <label>Program arguments <input type="text" maxLength={256} placeholder="e.g. 12 -5" value={consoleProgram.args} onChange={event => consoleProgram.setArgs(event.target.value)} /></label>
      <button className="btn primary" disabled={!consoleProgram.canRun} onClick={() => { setTerminal('program'); consoleProgram.run(); }}><Play size={15} /> Run program</button>
    </div>}
    <div className="terminal">
      <div className="terminal-bar">
        <div className="terminal-tabs" aria-label="Terminal views">
          <Terminal size={16} />
          <button className={terminal === 'build' ? 'on' : ''} onClick={() => setTerminal('build')}>Compiler output</button>
          <button className={terminal === 'program' ? 'on' : ''} onClick={() => setTerminal('program')}>Program terminal</button>
        </div>
        <div className="terminal-keys"><span>Send to C</span>{['g', 'p', 'q'].map(key => <button key={key} onClick={() => { setTerminal('program'); keyInput(key); }} aria-label={`Send ${key} key`}>{key}</button>)}</div>
      </div>
      <pre data-testid="terminal-output" tabIndex={0}>{terminal === 'build' ? build || compiler : output || 'Run or step a compiled C program to see its terminal output.'}</pre>
    </div>
    <div className="editor-footer">{dirty ? 'Source edited. Compile to run this version.' : <><Check size={14} /> Files stay on this computer.</>}</div>
  </section>;
}
