import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { WIDTH, HEIGHT, FOV, FRONT_YAW, OBSTACLE, effectiveWidth, footprints, paths, type Point, type World } from './physics';

function line(ctx: CanvasRenderingContext2D, path: Point[]) {
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
}
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = color;
  ctx.fill();
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
const angled = { a: 0.94, b: 0, c: -0.23, d: 0.77, e: 76, f: 48 };

function paint(canvas: HTMLCanvasElement, world: World, tilt: boolean, showRays: boolean, picked: number | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pixelRatio = canvas.width / WIDTH;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#242f26');
  bg.addColorStop(1, '#17251c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  if (tilt) ctx.transform(angled.a, angled.b, angled.c, angled.d, angled.e, angled.f);
  ctx.lineWidth = 1;
  for (let x = -200; x <= WIDTH + 200; x += 22) {
    ctx.strokeStyle = x % 88 === 0 ? '#b1c5ab29' : '#b1c5ab15';
    line(ctx, [{ x, y: -200 }, { x, y: HEIGHT + 200 }]);
    ctx.stroke();
  }
  for (let y = -200; y <= HEIGHT + 200; y += 22) {
    ctx.strokeStyle = y % 88 === 0 ? '#b1c5ab29' : '#b1c5ab15';
    line(ctx, [{ x: -200, y }, { x: WIDTH + 200, y }]);
    ctx.stroke();
  }
  const segments = paths[world.settings.track];
  const width = effectiveWidth(world.settings);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const floor = ctx.createLinearGradient(0, 68, 0, 385);
  floor.addColorStop(0, '#e4eadd');
  floor.addColorStop(1, '#f1f1dc');
  for (const path of segments) {
    line(ctx, path);
    ctx.strokeStyle = '#101a117f';
    ctx.lineWidth = Math.max(98, width + 54);
    ctx.stroke();
    ctx.strokeStyle = floor;
    ctx.lineWidth = Math.max(90, width + 46);
    ctx.stroke();
  }
  if (world.settings.track === 'gap') {
    ctx.fillStyle = '#eeeedb';
    ctx.fillRect(450, 248, 119, 90);
  }
  for (const path of segments) {
    line(ctx, path);
    ctx.strokeStyle = '#202822';
    ctx.lineWidth = width;
    ctx.stroke();
  }
  const [frontL, frontR, floorL, floorR] = footprints(world.pose, world.settings);
  if (showRays) {
    [frontL, frontR].forEach((p, i) => {
      const angle = world.pose.heading + (i === 0 ? -FRONT_YAW : FRONT_YAW);
      const active = world.blocked[i];
      const range = i === 0 ? world.settings.frontLeftRange : world.settings.frontRightRange;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, range, angle - FOV, angle + FOV);
      ctx.closePath();
      ctx.fillStyle = active ? '#f49a5755' : '#b5ee9e25';
      ctx.strokeStyle = active ? '#ee9a64' : '#a6dd8f85';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([4, 5]);
      line(ctx, [p, { x: p.x + Math.cos(angle) * range, y: p.y + Math.sin(angle) * range }]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }
  if (world.obstacle) {
    const { x, y } = world.obstacle;
    ctx.save();
    ctx.translate(x, y);
    rect(ctx, -22, -25, 48, 57, 7, '#11171380');
    rect(ctx, -OBSTACLE.halfWidth, -OBSTACLE.halfHeight, 42, 54, 6, '#f1a16d');
    ctx.save();
    ctx.clip();
    for (let y = -52; y <= 42; y += 12) {
      line(ctx, [{ x: -25, y }, { x: 27, y: y + 26 }]);
      ctx.strokeStyle = '#a7522f';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    ctx.restore();
    rect(ctx, -13, -19, 26, 38, 4, '#c66f48');
    rect(ctx, -11, -17, 22, 34, 3, '#eb9761');
    ctx.fillStyle = '#61321d';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  }
  const { x, y, heading } = world.pose;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  if (world.onStand) {
    rect(ctx, -48, -16, 96, 32, 4, '#7d583b');
    rect(ctx, -47, -18, 94, 32, 3, '#c29767');
    rect(ctx, -44, -10, 88, 2, 1, '#a67c54');
    rect(ctx, -44, 6, 88, 2, 1, '#a67c54');
  }
  rect(ctx, -36, -24, 73, 54, 13, '#0e160f88');
  for (const ax of [-21, 21]) {
    for (const side of [-1, 1]) {
      const wheelY = side < 0 ? -27 : 16;
      rect(ctx, ax - 10, wheelY, 20, 11, 3, '#111714');
      rect(ctx, ax - 8, wheelY + 1, 16, 8, 2, '#363d37');
      ctx.strokeStyle = '#87918870';
      ctx.lineWidth = 1;
      for (let tooth = -6; tooth <= 6; tooth += 4) {
        line(ctx, [{ x: ax + tooth, y: wheelY + 2 }, { x: ax + tooth, y: wheelY + 9 }]);
        ctx.stroke();
      }
      const command = world.commands[side < 0 ? 0 : 1];
      if (command && ax < 0) {
        const y = side * 33, direction = Math.sign(command);
        ctx.strokeStyle = '#b4ec94';
        ctx.lineWidth = 1.6;
        line(ctx, [{ x: -29, y }, { x: 29, y }]);
        ctx.stroke();
        line(ctx, [{ x: 29 * direction - 5 * direction, y: y - 4 }, { x: 29 * direction, y }, { x: 29 * direction - 5 * direction, y: y + 4 }]);
        ctx.stroke();
      }
    }
  }
  rect(ctx, -32, -21, 64, 42, 8, '#344b3e');
  rect(ctx, -31, -20, 62, 39, 6, '#749080');
  rect(ctx, -26, -17, 46, 34, 5, '#92a999');
  rect(ctx, -18, -13, 24, 26, 3, '#314b3c');
  rect(ctx, -15, -9, 17, 5, 1, '#688876');
  for (const y of [-11, 11]) {
    circle(ctx, -25, y, 2, '#dae6d6');
    rect(ctx, 23, y - 4, 12, 8, 2, '#27372d');
  }
  ctx.strokeStyle = '#e8f5d8';
  ctx.lineWidth = 1.6;
  line(ctx, [{ x: 8, y: 0 }, { x: 20, y: 0 }, { x: 16, y: -4 }]);
  ctx.stroke();
  line(ctx, [{ x: 16, y: 4 }, { x: 20, y: 0 }]);
  ctx.stroke();
  ctx.restore();
  [frontL, frontR].forEach((p, i) => circle(ctx, p.x, p.y, 3.4, world.blocked[i] ? '#ffb18b' : '#a4e894'));
  [floorL, floorR].forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, picked === i ? 8 : 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#a2e0de';
    ctx.lineWidth = picked === i ? 2.8 : 1.5;
    ctx.stroke();
    circle(ctx, p.x, p.y, 2.2, '#ddf7f5');
  });
  ctx.restore();
}

export function ArenaCanvas({ world, tilt, rays, canvas, running, changed }: {
  world: World; tilt: boolean; rays: boolean; canvas: RefObject<HTMLCanvasElement | null>; running: boolean; changed: (dragRobot?: boolean) => void;
}) {
  const drag = useRef<{ target: 'robot' | 'obstacle'; dx: number; dy: number } | null>(null);
  const [picked, inspect] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [density, setDensity] = useState(1);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setDensity(Math.max(1, Math.min(2, devicePixelRatio * node.clientWidth / WIDTH))));
    observer.observe(node);
    return () => observer.disconnect();
  }, [canvas]);
  useEffect(() => {
    if (canvas.current) paint(canvas.current, world, tilt, rays, picked);
  });
  function position(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) * WIDTH / box.width;
    const y = (event.clientY - box.top) * HEIGHT / box.height;
    if (!tilt) return { x, y };
    const py = (y - angled.f) / angled.d;
    return { x: (x - angled.e - angled.c * py) / angled.a, y: py };
  }
  function down(event: PointerEvent<HTMLCanvasElement>) {
    const p = position(event);
    const relative = (other: Point) => Math.hypot(p.x - other.x, p.y - other.y);
    const sensor = footprints(world.pose, world.settings).slice(2).findIndex(spot => relative(spot) < 7);
    if (sensor >= 0) return inspect(sensor);
    inspect(null);
    const target = world.obstacle && relative(world.obstacle) < 36 ? 'obstacle' : relative(world.pose) < 40 ? 'robot' : null;
    if (!target) return;
    const origin = target === 'robot' ? world.pose : world.obstacle!;
    drag.current = { target, dx: p.x - origin.x, dy: p.y - origin.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(true);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drag.current) return;
    const p = position(event);
    p.x -= drag.current.dx;
    p.y -= drag.current.dy;
    if (drag.current.target === 'robot') world.moveRobot(p);
    else world.placeObstacle(p, !running);
    changed(drag.current.target === 'robot');
  }
  function up() { drag.current = null; setActive(false); }
  return <div className="canvas-frame">
    <canvas ref={canvas} width={Math.round(WIDTH * density)} height={Math.round(HEIGHT * density)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      className={active ? 'dragging' : ''} aria-label="Interactive track. Drag the robot or obstacle, and click the blue floor sensor footprints." />
    {picked !== null && <div className="canvas-readout">Floor {picked === 0 ? 'left' : 'right'} · bit {world.bits[picked + 2]} · reflectivity {world.floor[picked].toFixed(2)}</div>}
  </div>;
}
