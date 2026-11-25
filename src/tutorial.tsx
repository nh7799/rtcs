import { useState, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRight, BookOpen, Camera, Check, ClipboardCheck, Code2, Cpu, Laptop, MapPin, Radio, RotateCcw, Terminal,
} from 'lucide-react';
import { steps, type Lesson, type Sample } from './lessons';
import { lineCases, obstacleCases, scenarios, sonarCases, type Scenario } from './course-scenarios';
import { SettingsPanel } from './settings';
import type { Settings, Trial, World } from './physics';

type Props = {
  stage: Lesson; complete: boolean; onCheck: () => void; go: (stage: Lesson) => void;
  load: (sample: Sample, target: 'code-workspace' | 'simulator', scenario?: Scenario) => void;
  place: (scenario: Scenario) => void; busy: boolean;
  world: World; change: (patch: Partial<Settings>) => void;
  trials: Trial[]; onRecord: () => void; onTrial: () => void; onCsv: () => void; onScreenshot: () => void;
  limit: number; setLimit: (value: number) => void; reference: string | undefined;
  tune: (name: string, value: number) => void;
};

function Prediction({ question, choices, correct, feedback }: {
  question: string; choices: string[]; correct: number; feedback: string;
}) {
  const [choice, choose] = useState<number | null>(null);
  return <fieldset className="prediction">
    <legend>Check your prediction</legend>
    <p>{question}</p>
    <div className="lesson-actions">{choices.map((option, index) =>
      <button key={option} className={choice === index ? 'btn selected' : 'btn'} aria-pressed={choice === index} onClick={() => choose(index)}>{option}</button>,
    )}</div>
    <p className="prediction-feedback" aria-live="polite">{choice === correct ? feedback : choice === null ? '' : 'Try again. Use the rule above to predict this case.'}</p>
  </fieldset>;
}

function Cases({ ids, place }: { ids: readonly Scenario[]; place: (scenario: Scenario) => void }) {
  return <div className="case-panel">
    <h3><MapPin size={16} /> Set a test position</h3>
    <p>Each case resets the arena to a straight track with the standard calibration. Press <strong>Run</strong> in the arena to test your C code.</p>
    <div className="lesson-actions">{ids.map(id => <button className="btn" key={id} onClick={() => place(id)}>{scenarios[id].label}</button>)}</div>
  </div>;
}

function PwmDemo() {
  const [duty, setDuty] = useState(30);
  return <div className="pwm-demo">
    <label>Duty cycle <output>{duty}%</output><input type="range" min={0} max={100} value={duty} onChange={event => setDuty(Number(event.target.value))} /></label>
    <div className="pwm-periods" aria-label={`Three PWM periods. Voltage is on for ${duty / 10} milliseconds in each 10 millisecond period.`}>
      {[0, 1, 2].map(period => <div key={period}><span style={{ width: `${duty}%` }} /></div>)}
    </div>
    <p>Green shows voltage on for <strong>{duty / 10} ms</strong> in each illustrative 10 ms period. On the robot, voltage switching controls a DC motor. Speed also depends on load and friction.</p>
  </div>;
}

function StudyTask({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return <div className="study-task">
    <h3>{title}</h3>
    <div className="study-body">{children}</div>
    {action}
  </div>;
}

export function Tutorial(p: Props) {
  const { stage } = p;
  const index = steps.findIndex(step => step.id === stage);
  const current = steps[index];
  return <section id="lesson" className="card lesson-card" aria-labelledby="lesson-heading">
    <div className="card-heading">
      <div className="heading-inline"><div className="section-icon"><BookOpen size={19} /></div><div>
        <h2 id="lesson-heading">{stage === 'start' ? 'Your coursework learning path' : 'Learn and practise'}</h2><p>{current.source}</p>
      </div></div>
    </div>
    <div className="lesson-body">
      {stage === 'start' && <>
        <p>Start with a C program that prints a result. Work up to reading the robot’s inputs, making a driving decision, and explaining that decision in your own words.</p>
        <div className="lesson-actions">
          <button className="btn primary" onClick={() => p.go('c')}><Code2 size={15} /> Start with Tutorial 1</button>
          <button className="btn" onClick={() => p.go('terminal')}><Terminal size={15} /> Rehearse the Pi terminal</button>
          <button className="btn" onClick={() => p.go('obstacle')}>Practise stop and resume <ArrowRight size={15} /></button>
        </div>
        <div className="course-map">
          {([
            ['Tutorial 1', 'C basics', 'Loops, macros, bits and arguments', 'c'],
            ['Tutorial 2', 'Program the Initio', 'Copy, compile and run testIR', 'connect'],
            ['Tutorial 3', 'Extend the sensors', 'Sonar, floor detection and P37', 'extensions'],
            ['Tutorial 4', 'Follow a line', 'Steer, keep the stop rule and tune speed', 'line'],
          ] as const).map(([tutorial, title, detail, to]) => <button className="course-topic" key={to} onClick={() => p.go(to)}>
            <span>{tutorial}</span><strong>{title}</strong><small>{detail}</small><ArrowRight size={16} />
          </button>)}
        </div>
        <details><summary>What counts toward CW1?</summary>
          <div className="outcome-grid">
            <div><span>10 points</span><h3>1. I/O Control</h3><p>Explain the Initio functions you use, their parameters, and how PWM, energy, DC motor speed and spinning friction relate.</p></div>
            <div><span>10 points</span><h3>2. Obstacle Avoidance</h3><p>Demonstrate a safe stop in front of an obstacle and resume when clear. Explain the sensors, logic and fault tolerance.</p></div>
            <div><span>10 points</span><h3>3. Line Follower</h3><p>Extend the template, retain the obstacle stop, choose a forward speed and explain the limits of your feedback.</p></div>
          </div>
          <p>Sonar, flashing an LED and steering around an obstacle are tutorial extensions. The coursework brief places the marks on the three tasks above. Use the bundled programs to practise, and use the lecturer’s starter files for coursework development.</p>
        </details>
      </>}
      {stage === 'c' && <>
        <p>A C source file is text. <strong>Compile</strong> turns that text into a runnable program. <strong>Run program</strong> executes it and shows what it prints. The first copies below are ready to run.</p>
        <div className="study-grid">
          <StudyTask title="1. Read a loop" action={<button className="btn primary" disabled={p.busy} onClick={() => p.load('power.c', 'code-workspace')}><Code2 size={15} /> Load powers of two</button>}>
            <p>Run it. Find where <code>pot</code> starts at 1, doubles, and stops being less than 10,000. Change the limit to <code>40</code>, compile, and predict the last value before you run.</p>
            <details><summary>Check your result</summary><p>The last value is 32. The next value is 64, so the loop ends before printing it.</p></details>
          </StudyTask>
          <StudyTask title="2. Finish two macros" action={<button className="btn" disabled={p.busy} onClick={() => p.load('macro_bits.c', 'code-workspace')}><Code2 size={15} /> Load macros and bit 12</button>}>
            <p>Run the starter and read the four outputs. Replace the two <code>0</code> placeholders. Predict each test case before compiling the edit.</p>
            <details><summary>Hint and expected output</summary><p>Use <code>condition ? a : b</code> to choose the greater value. Wrap each macro argument and the complete expression in parentheses. Shift an unsigned value right by 12, then use <code>&amp; 1u</code> to read that bit. The four results are 8, −3, 1 and 0.</p></details>
          </StudyTask>
          <StudyTask title="3. Read program arguments" action={<button className="btn" disabled={p.busy} onClick={() => p.load('sum.c', 'code-workspace')}><Code2 size={15} /> Load sum from arguments</button>}>
            <p>Run with <code>12 -5</code>, then try <code>12 abc</code>. <code>argc</code> counts the program name and arguments. <code>argv</code> holds the text, and <code>strtol</code> reads the number.</p>
            <details><summary>Try hexadecimal</summary><p>Change <code>INPUT_BASE</code> to <code>16</code>, compile, and use <code>A 10</code>. The decimal sum is 26. For non-negative totals, try printing in hex with <code>%lx</code> and an <code>unsigned long</code> argument.</p></details>
          </StudyTask>
        </div>
        <details><summary>Read the first program line by line</summary>
          <ul className="practice-list">
            <li><code>#include &lt;stdio.h&gt;</code> makes the declarations for printing available. <code>main()</code> is where the program starts.</li>
            <li><code>int pot = 1</code> creates an integer variable with an initial value. <code>while</code> repeats its block as long as its condition is true.</li>
            <li><code>fprintf(stdout, ...)</code> writes to standard output. Each <code>%d</code> uses the next integer in the argument list. <code>\n</code> starts a new line.</li>
            <li><code>count++</code> adds one. <code>pot = pot * 2</code> stores the doubled value. The next check of <code>while</code> uses that new value.</li>
            <li><code>return EXIT_SUCCESS</code> reports that the program finished successfully. The invalid-input exercise returns a failure code and prints to standard error.</li>
          </ul>
        </details>
        <details><summary>Match the commands from Tutorial 1</summary>
          <dl className="command-list">
            <div><dt><code>gcc -o power power.c</code></dt><dd>In a terminal with GCC, compile the source into a native executable called <code>power</code>. Run it with <code>./power</code>. In this app, Compile and Run program use WebAssembly.</dd></div>
            <div><dt><code>gcc -E -o macro_bits.i macro_bits.c</code></dt><dd>In a terminal, stop after preprocessing. Open <code>macro_bits.i</code> and find the last lines to see how GCC expanded your macros.</dd></div>
            <div><dt><code>man 3 printf</code></dt><dd>Look up format specifiers in the local manual. In the app, open Compiler output, read the first error, and fix its filename and line before trying again.</dd></div>
          </dl>
        </details>
      </>}
      {stage === 'connect' && <>
        <p>Rehearse the lab workflow before touching the real car. Use your tutor’s robot address and account in the lab.</p>
        <div className="connect-diagram" aria-label="The lab PC copies files and opens a remote shell on the Initio robot.">
          <div><Laptop /><b>Lab PC</b></div><ArrowRight /><div><Terminal /><b>SSH / SCP</b></div><ArrowRight /><div><Cpu /><b>Initio robot</b></div>
        </div>
        <div className="study-grid">
          <StudyTask title="Copy and connect" action={null}><p>From the PC, use <code>scp -r testIR user@robot:~</code> to copy the folder containing <code>testIR.c</code> and the Makefile. Use <code>ssh user@robot</code> to open the robot’s shell. Keep a backup because the lab accounts are shared.</p></StudyTask>
          <StudyTask title="Bench run" action={null}><p>In the robot shell, enter the project directory and run <code>make testIR</code>. With the car horizontal on the wooden stand and tyres raised, run <code>make run</code>. Check IR readings and the motor response. Use <kbd>q</kbd> to quit the example.</p></StudyTask>
          <StudyTask title="Floor run" action={null}><p>Follow Tutorial 2 and your tutor. Schedule with <code>rtcs schedule testIR</code> or the supplied <code>make schedule</code>. Check <code>rtcs log</code> and run <code>sudo shutdown now</code> on the robot before following the lab’s cable and battery procedure. The tutorial gives a five-minute restart window.</p></StudyTask>
        </div>
        <div className="lesson-actions"><button className="btn primary" onClick={() => p.go('terminal')}><Terminal size={15} /> Practise these commands</button></div>
        <Prediction question="Where do you run make testIR to build against the car's libraries?" choices={['On the robot over SSH', 'In the simulator terminal']} correct={0} feedback="The robot shell uses the Initio, curses and wiringPi libraries installed on the lab car." />
      </>}
      {stage === 'io' && <>
        <p>Inputs are values your program reads. Outputs are commands it sends. The Live sensors cards show raw bits. A motor percentage is the command, and Wheel speed shows the simulated response.</p>
        <dl className="command-list">
          <div><dt><code>initio_IrLeft()</code> / <code>initio_IrRight()</code></dt><dd>Read the front obstacle sensors. Default simulation polarity is 0 clear, 1 blocked.</dd></div>
          <div><dt><code>initio_IrLineLeft()</code> / <code>initio_IrLineRight()</code></dt><dd>Read the downward floor sensors. Default simulation polarity is 0 light, 1 dark.</dd></div>
          <div><dt><code>initio_DriveForward(speed)</code></dt><dd>Drive both sides forward. The parameter is a command from 0 to 100.</dd></div>
          <div><dt><code>initio_TurnForward(left, right)</code></dt><dd>Give the left and right sides separate commands. A larger right-wheel command turns the car left.</dd></div>
          <div><dt><code>initio_Stop()</code> / <code>initio_SpinLeft(speed)</code></dt><dd>Stop the motors, or use opposite wheel directions to spin at the specified command.</dd></div>
        </dl>
        <details><summary>Explore PWM, speed and energy</summary>
          <PwmDemo />
          <p>Power depends on voltage and current, and energy accumulates over time. Spinning can make the tyres scrub sideways on the floor. Grip and motor load then affect speed and current. In your report, connect this explanation to the motor functions you actually use.</p>
        </details>
        <details><summary>Compare two motor commands</summary>
          <p>Load the practice program with a clear track. Change <code>initio_DriveForward(100)</code> to <code>initio_DriveForward(30)</code>, compile, and watch Wheel speed when you run. Repeat at 60 from the same position. In a separate run, try <code>initio_SpinLeft(30)</code> and explain the wheel directions.</p>
          <div className="lesson-actions"><button className="btn" disabled={p.busy} onClick={() => p.load('obstacle_practice.c', 'code-workspace', 'clear')}>Load motor practice</button></div>
        </details>
        <details id="calibration" open><summary>Calibrate sensor polarity</summary>
          <p>Compare a clear and a blocked reading for each front sensor. Then compare light floor and black tape for each floor sensor. Flip a polarity below and predict which C condition must change. Repeat the clear/blocked and light/dark checks on your lab car.</p>
          <SettingsPanel world={p.world} change={p.change} type="sensor" />
        </details>
        <div className="lesson-actions"><button className="btn" onClick={() => p.go('obstacle')}>Try the sensor positions <ArrowRight size={15} /></button></div>
      </>}
      {stage === 'obstacle' && <>
        <p>Run the practice example or upload your lecturer’s <code>testIR.c</code> and compile it. Test both channels before moving on to the line follower.</p>
        <div className="lesson-actions"><button className="btn primary" disabled={p.busy} onClick={() => p.load('obstacle_practice.c', 'simulator')}><Terminal size={15} /> Load obstacle practice</button></div>
        <Cases ids={obstacleCases} place={p.place} />
        <ol className="practice-list">
          <li>In <strong>Clear</strong>, both front bits should be 0 and the controller should drive.</li>
          <li>In each blocked case, check that both motor commands go to 0. Remove the obstacle while running and check that movement resumes.</li>
          <li>Open <strong>Program terminal</strong> in the C workspace. Match the printed sensor readings to the arena and press <kbd>q</kbd> to exit the loop.</li>
        </ol>
        <details><summary>Explain the C code and fault tolerance</summary><p><code>left == 0 &amp;&amp; right == 0</code> permits forward movement only when both readings are clear. Either sensor can trigger a stop. A sensor stuck on blocked keeps the car stopped. If one sensor misses an obstacle, the other can only help where its coverage reaches. Check sensor polarity, range and stopping distance on the car.</p></details>
        <details><summary>Explain the curses calls</summary><p><code>mvprintw(row, column, format, …)</code> writes formatted text at a position on the curses screen. <code>refresh()</code> displays the updates. With <code>nodelay</code>, <code>getch()</code> can check for <kbd>q</kbd> and return immediately when there’s no key. <code>delay(100)</code> adds a wait between checks.</p></details>
        <Prediction question="The left sensor reads clear and the right sensor reads blocked. What should testIR do?" choices={['Keep driving', 'Stop both motors', 'Turn to the left']} correct={1} feedback="Stop both motors. The right reading makes the both-clear condition false." />
      </>}
      {stage === 'extensions' && <>
        <p>Try Tutorial 3’s inputs and outputs on the virtual robot. For CW1 Section 2, practise the IR stop-and-resume behaviour in the previous lesson.</p>
        <div className="lesson-actions"><button className="btn primary" disabled={p.busy} onClick={() => p.load('sensor_extensions_practice.c', 'simulator', 'sonar-far')}><Radio size={15} /> Load sensor extensions</button></div>
        <div className="study-grid">
          <StudyTask title="Ultrasonic distance" action={null}><p><code>initio_UsGetDistance()</code> returns centimetres. In the arena, 0 means no echo. Check the initial commands at 130 cm, 75 cm and 45 cm. Expect 100%, 70% and 0% respectively.</p></StudyTask>
          <StudyTask title="Stop on dark floor" action={null}><p>Change <code>STOP_ON_DARK</code> to 1 and compile. Use the 130 cm case first. Then place the robot with one or both floor sensors on the tape. Even with clear front sensors, it should stop.</p></StudyTask>
          <StudyTask title="Flash the P37 LED" action={null}><p><code>pinMode(37, OUTPUT)</code> selects an output. Use <code>millis()</code> to decide when 500 simulated ms have elapsed, then toggle <code>digitalWrite(37, led)</code>. Watch it keep blinking while the wheels are stopped.</p></StudyTask>
        </div>
        <Cases ids={sonarCases} place={p.place} />
        <details><summary>Try the extension from Tutorial 2, exercise 5</summary><p>In a separate practice copy, design an obstacle turn and test both front sensors again before driving forward. Record what the robot does when its turn moves the object out of view. Keep the stop-and-resume controller for your CW1 baseline.</p></details>
        <details><summary>Explore the advanced following exercise</summary><p>Tutorial 2 asks how to keep a distance behind a moving object. Try moving the obstacle during a run. Write down what the controller would need to do when its distance is below, inside, or above a target band. Include a plan for a missing echo.</p></details>
        <Prediction question="What does an ultrasonic return of 0 mean in this exercise?" choices={['No echo', 'Object 0 cm away']} correct={0} feedback="It means no echo was returned. A positive distance is needed before applying the 50 cm and 100 cm thresholds." />
        <p className="source-note"><a href="https://github.com/rkirner/initio_lib/blob/master/initio.h" target="_blank" rel="noreferrer">Initio library declarations <ArrowRight size={12} /></a></p>
      </>}
      {stage === 'line' && <>
        <p>Load the practice template, or upload the lecturer’s <code>line_follower.c</code>. Fill in the sensor reads and decisions one at a time. The practice template has placeholder floor readings and conditions so you can build the logic yourself.</p>
        <div className="lesson-actions">
          <button className="btn primary" disabled={p.busy} onClick={() => p.load('line_template_practice.c', 'code-workspace')}>Load practice template</button>
          <button className="btn" disabled={p.busy} onClick={() => p.load('line_reference_practice.c', 'simulator', 'line-both')}>Try a completed simulation reference</button>
        </div>
        <ol className="practice-list">
          <li>Read both floor sensors on every pass. Make <code>BLACK</code> and <code>WHITE</code> match the floor sensor calibration.</li>
          <li>Test the front sensors first. Stop if either reports an obstacle, even when both floor sensors see black.</li>
          <li>With the front clear, use the table to replace the placeholder branches and choose a motor call for each case. Compile, then check each position.</li>
        </ol>
        <div className="table-scroll"><table className="decision-table">
          <thead><tr><th scope="col">Left floor</th><th scope="col">Right floor</th><th scope="col">With the front clear</th></tr></thead>
          <tbody>
            <tr><td>Black</td><td>Black</td><td>Drive forward at your chosen 0–100 command</td></tr>
            <tr><td>Black</td><td>White</td><td>Steer left</td></tr>
            <tr><td>White</td><td>Black</td><td>Steer right</td></tr>
            <tr><td>White</td><td>White</td><td>Report line lost. The simulation reference also stops.</td></tr>
          </tbody>
        </table></div>
        <Cases ids={lineCases} place={p.place} />
        <details><summary>Transfer your logic to the lab</summary><p>Tutorial 4 specifies 100% PWM for turns on the sticky lab floor. The simulation reference uses a reduced rolling turn, so its settings are a simulation baseline. Calibrate the real car, use the course track on the floor, and follow Tutorial 2’s scheduling workflow. The tutorial also describes a syntax-check target in the supplied Makefile for use on a regular computer.</p></details>
        <Prediction question="Both floor sensors see black, and the front-left sensor sees an obstacle. Which branch runs?" choices={['Drive forward', 'Stop for the obstacle', 'Lost line']} correct={1} feedback="Stop for the obstacle. Read the front sensors before deciding how to follow the line." />
      </>}
      {stage === 'tune' && <>
        <p>Choose one forward command, compile it, and run the same track twice so you know what a repeatable result looks like. Then try a higher command. Keep the turn command, track, seed, start and time limit fixed. Remove the obstacle for lap comparisons, then add it back for a separate stop-and-resume check.</p>
        <div className="lesson-actions">
          <button className="btn" disabled={p.busy} onClick={() => p.load('line_reference_practice.c', 'code-workspace')}>Load tunable C reference</button>
          <label className="duration-label">Trial length <input type="number" aria-label="Trial length in seconds" min="1" max="180" value={p.limit} onChange={event => p.setLimit(Math.max(1, Math.min(180, Number(event.target.value))))} /> s</label>
          <button className="btn" onClick={p.onTrial}><RotateCcw size={14} /> Reset trial</button>
          <button className="btn primary" onClick={p.onRecord}>Record trial</button>
        </div>
        {p.reference !== undefined && <div className="settings-grid speeds">
          {([['FORWARD_SPEED', 'Forward command'], ['TURN_SPEED', 'Turn command']] as const).map(([name, label]) => {
            const current = Number(p.reference!.match(new RegExp(`^#define ${name} (\\d+)`, 'm'))?.[1] ?? 0);
            return <label className="setting" key={name}><span>{label} <output>{current} / 100</output></span><input type="range" min={0} max={100} value={current} onChange={event => p.tune(name, Number(event.target.value))} /></label>;
          })}
          <p>These sliders edit the reference C constants. Compile after changing them. For a lap trial, select <strong>Smooth loop</strong>, remove the obstacle and set a 30-second limit.</p>
        </div>}
        <details><summary>Why can a faster controller lose the line?</summary><p>The two sensors provide four combinations. They cannot directly measure how far the robot is from the centre or how large its heading error is. A faster run travels farther between readings and may overshoot a bend. Try <strong>Sharp bend</strong> to see the problem. Describe the limits of this feedback before proposing a refinement.</p></details>
        <details><summary>Track and motor model</summary><SettingsPanel world={p.world} change={p.change} type="physics" /></details>
        <div className="trial-header"><h3>Recorded simulation trials</h3><button className="btn" onClick={p.onCsv} disabled={!p.trials.length}><ArrowDownToLine size={15} /> CSV</button></div>
        {p.trials.length ? <div className="table-scroll"><table><thead><tr>{['Trial', 'Forward command', 'Peak command', 'Time', 'Laps', 'Last lap', 'Line losses', 'Stopping distance', 'Collisions'].map(name => <th key={name} scope="col">{name}</th>)}</tr></thead><tbody>
          {p.trials.map((trial, i) => <tr key={i}><td>{i + 1}</td><td>{trial.forwardCommand ?? '—'}</td><td>{trial.speed}</td><td>{trial.time.toFixed(2)} s</td><td>{trial.laps}</td><td>{trial.lastLap === null ? '—' : trial.lastLap.toFixed(2) + ' s'}</td><td>{trial.losses}</td><td>{trial.stopping === null ? '—' : trial.stopping.toFixed(3) + ' m'}</td><td>{trial.collisions}</td></tr>)}
        </tbody></table></div> : <p>No trials recorded. Run the robot, then select Record trial.</p>}
      </>}
      {stage === 'report' && <>
        <p>Rehearse with your code open. Point to each sensor read, decision, motor call and cleanup statement and explain its effect in your own words.</p>
        <div className="outcome-grid">
          <div><span>10 points</span><h3>Section 1: I/O Control</h3><p>List your Initio calls, parameters and purpose. Explain PWM, DC motor speed, energy and tyre friction when spinning.</p></div>
          <div><span>10 points</span><h3>Section 2: Obstacle Avoidance</h3><p>Describe the front sensors, logic, stop and resume results, and what the two sensors can cover when one misses an obstacle.</p></div>
          <div><span>10 points</span><h3>Section 3: Line Follower</h3><p>Explain your branch order, chosen forward command (0–100), timing and limits of two-sensor feedback.</p></div>
        </div>
        <details><summary>Rehearse the demo questions</summary>
          <ul className="practice-list">
            <li>Point to the line that stops both motors. What happens if only one front sensor sees an obstacle?</li>
            <li>Which value means black on your car? How would you find out on a different car?</li>
            <li>What do <code>mvprintw()</code> and <code>refresh()</code> do? How can the loop accept <kbd>q</kbd>?</li>
            <li>How did you choose a forward speed? When do the two floor readings lose information?</li>
          </ul>
        </details>
        <details><summary>Check the report and submission format</summary>
          <ul className="practice-list">
            <li>Write an individual report. Use Arial 11, left alignment, and the three exact section titles above. Begin with <code>CW1: (full student name), (student number)</code>.</li>
            <li>Limit the main report to two pages including relevant figures. Use <strong>Appendix: Source code of CW1</strong> for your modified or added source code and reference appendix material in the report.</li>
            <li>If you extend the basic line-following algorithm, add a subsection titled <strong>Refinement of Line Follower Algorithm</strong> in Section 3.</li>
            <li>Submit the report and separate source ZIP through Canvas before 3 pm on the deadline day. The brief specifies <code>RTCS-&lt;Author-Surname-Forename&gt;-Report.pdf</code> and <code>RTCS-&lt;Author-Surname-Forename&gt;-SW.zip</code>.</li>
          </ul>
        </details>
        <p>Use the simulator to rehearse branch cases and record trial settings. Verify polarity, stopping distance, speed and lap time on the university robot before reporting real measurements.</p>
        <div className="lesson-actions">
          <button className="btn" onClick={p.onScreenshot}><Camera size={15} /> Simulation screenshot</button>
          <button className="btn" onClick={p.onCsv} disabled={!p.trials.length}><ArrowDownToLine size={15} /> Simulation CSV</button>
        </div>
      </>}
    </div>
    <div className="lesson-footer">
      <button className={'check-lesson' + (p.complete ? ' done' : '')} onClick={p.onCheck} aria-pressed={p.complete}>
        {p.complete ? <Check size={17} /> : <ClipboardCheck size={17} />} {current.check}
      </button>
      {index < steps.length - 1 && <button className="btn" onClick={() => p.go(steps[index + 1].id)}>Next lesson <ArrowRight size={15} /></button>}
    </div>
  </section>;
}
