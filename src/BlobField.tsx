import { useEffect, useRef, useState } from 'react';
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { CASH, money, type Holding } from './domain';

type Blob = SimulationNodeDatum & {
  symbol: string;
  r: number;
  targetR: number;
  ax: number;
  ay: number;
  seed: number;
};
type Props = {
  rows: Holding[];
  selected: string;
  onSelect: (symbol: string) => void;
  onPour: (from: string, to: string) => void;
  paused: boolean;
  reset: number;
  burst: { from: string; to: string; id: string } | null;
};
const anchor = [
  [0.27, 0.4],
  [0.65, 0.32],
  [0.48, 0.68],
  [0.82, 0.66],
  [0.15, 0.77],
  [0.84, 0.24],
];

export function BlobField({ rows, selected, onSelect, onPour, paused, reset, burst }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Blob[]>([]);
  const current = useRef({ rows, selected, onSelect, onPour, paused, burst });
  current.current = { rows, selected, onSelect, onPour, paused, burst };
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{
    from: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const hoverRef = useRef<string | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reduced.current = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let width = 0,
      height = 0,
      frame = 0,
      lastBurst = '',
      burstAt = 0,
      motionTime = 0,
      previous = 0,
      lastLayout = '';
    const simulation = forceSimulation<Blob>().stop().velocityDecay(0.6);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodesRef.current = [];
      lastLayout = '';
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    function sync() {
      const active = current.current.rows.filter((r) => r.value > 0.005);
      const total = active.reduce((s, r) => s + r.value, 0) || 1;
      // A single area scale preserves relative dollar areas, including tiny positions.
      const area = Math.min(
        width * height * 0.38,
        (Math.PI * (Math.min(width, height) * 0.32) ** 2) /
          Math.max(...active.map((r) => r.value / total), 1e-6),
      );
      const old = new Map(nodesRef.current.map((b) => [b.symbol, b]));
      const nodes = active.map((row, i) => {
        const a =
          active.length <= 6
            ? anchor[i]
            : [
                0.5 + Math.cos((i / active.length) * Math.PI * 2) * 0.32,
                0.5 + Math.sin((i / active.length) * Math.PI * 2) * 0.3,
              ];
        const r = Math.sqrt(((row.value / total) * area) / Math.PI);
        const existing = old.get(row.symbol);
        return existing
          ? Object.assign(existing, { targetR: r, ax: a[0] * width, ay: a[1] * height })
          : {
              symbol: row.symbol,
              x: a[0] * width,
              y: a[1] * height,
              ax: a[0] * width,
              ay: a[1] * height,
              r,
              targetR: r,
              seed: i * 1.83,
            };
      });
      const membershipChanged =
        nodes.map((n) => n.symbol).join() !== nodesRef.current.map((n) => n.symbol).join();
      if (membershipChanged) {
        nodesRef.current = nodes;
        simulation
          .nodes(nodes)
          .force('x', forceX<Blob>((b) => b.ax).strength(0.012))
          .force('y', forceY<Blob>((b) => b.ay).strength(0.012))
          .force('collision', forceCollide<Blob>((b) => b.r * 1.09 + 9).iterations(3));
      } else nodesRef.current = nodes;
      const frozen = current.current.paused || reduced.current;
      const layoutKey = `${frozen}:${active.map((r) => `${r.symbol}:${r.value}`).join()}`;
      for (const b of nodes) b.r += (b.targetR - b.r) * (frozen ? 1 : 0.055);
      if (!frozen || layoutKey !== lastLayout) {
        simulation.force('collision', forceCollide<Blob>((b) => b.r * 1.09 + 9).iterations(3));
        simulation.alpha(0.18);
        // Constrain every solver step so collisions cannot be resolved outside the viewport.
        for (let step = 0; step < (frozen || membershipChanged ? 120 : 1); step++) {
          simulation.tick();
          for (const b of nodes) {
            b.x = Math.max(b.r * 1.08 + 10, Math.min(width - b.r * 1.08 - 10, b.x!));
            b.y = Math.max(b.r * 1.08 + 10, Math.min(height - b.r * 1.08 - 10, b.y!));
          }
        }
      }
      lastLayout = layoutKey;
    }
    function blobPath(b: Blob, time: number, factor = 1) {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const angle = (i / 96) * Math.PI * 2;
        const wobble =
          1 +
          0.041 * Math.sin(3 * angle + time * 0.7 + b.seed) +
          0.024 * Math.sin(5 * angle - time * 0.45 + b.seed);
        const x = b.x! + Math.cos(angle) * b.r * wobble * factor;
        const y = b.y! + Math.sin(angle) * b.r * wobble * factor;
        if (!i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    function draw(time: number) {
      const dt = previous ? Math.min(time - previous, 40) : 0;
      previous = time;
      if (!current.current.paused && !reduced.current) motionTime += dt / 1000;
      if (!width || !height) {
        frame = requestAnimationFrame(draw);
        return;
      }
      sync();
      ctx.clearRect(0, 0, width, height);
      const rowMap = new Map(current.current.rows.map((r) => [r.symbol, r]));
      for (const b of nodesRef.current) {
        const row = rowMap.get(b.symbol)!;
        const active = current.current.selected === b.symbol;
        ctx.save();
        if (active || hoverRef.current === b.symbol) {
          blobPath(b, motionTime, 1.085);
          ctx.strokeStyle = active ? row.color + '80' : '#ffffff35';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        blobPath(b, motionTime);
        const fill = ctx.createRadialGradient(
          b.x! - b.r * 0.38,
          b.y! - b.r * 0.45,
          b.r * 0.06,
          b.x!,
          b.y!,
          b.r * 1.12,
        );
        fill.addColorStop(0, row.color);
        fill.addColorStop(0.55, row.color + 'de');
        fill.addColorStop(0.84, row.color + 'ad');
        fill.addColorStop(1, row.color + '65');
        ctx.fillStyle = fill;
        ctx.shadowColor = row.color + '16';
        ctx.shadowBlur = 28;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.clip();
        const shine = ctx.createRadialGradient(
          b.x! - b.r * 0.35,
          b.y! - b.r * 0.62,
          0,
          b.x! - b.r * 0.3,
          b.y! - b.r * 0.6,
          b.r * 0.6,
        );
        shine.addColorStop(0, '#ffffff58');
        shine.addColorStop(1, '#ffffff00');
        ctx.fillStyle = shine;
        ctx.fillRect(b.x! - b.r * 1.1, b.y! - b.r * 1.1, b.r * 2.2, b.r * 2.2);
        ctx.restore();
        if (b.r >= 31) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#15231e';
          ctx.font = `700 ${b.r < 48 ? 12 : b.r < 75 ? 17 : 21}px Manrope, sans-serif`;
          ctx.fillText(b.symbol, b.x!, b.y! - (b.r < 48 ? 7 : 15));
          ctx.font = `500 ${b.r < 48 ? 10 : 13}px "DM Sans", sans-serif`;
          ctx.fillText(money(row.value, 0), b.x!, b.y! + (b.r < 48 ? 9 : 10));
          if (b.r > 57) {
            ctx.fillStyle = '#263c32';
            ctx.font = '500 11px "DM Sans", sans-serif';
            ctx.fillText(`${row.weight.toFixed(1)}%`, b.x!, b.y! + 30);
          }
        }
        ctx.restore();
      }
      const d = drag.current;
      if (d?.moved) {
        const b = nodesRef.current.find((n) => n.symbol === d.from);
        if (b) {
          ctx.beginPath();
          ctx.moveTo(b.x!, b.y!);
          ctx.quadraticCurveTo((b.x! + d.x) / 2, Math.min(b.y!, d.y) - 30, d.x, d.y);
          ctx.strokeStyle = '#d6efbc';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 7]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const burst = current.current.burst;
      if (burst && burst.id !== lastBurst) {
        lastBurst = burst.id;
        burstAt = time;
      }
      if (burst && time - burstAt < 950 && !reduced.current) {
        const from = nodesRef.current.find((n) => n.symbol === burst.from),
          to = nodesRef.current.find((n) => n.symbol === burst.to);
        if (from && to)
          for (let i = 0; i < 12; i++) {
            const p = Math.max(0, Math.min(1, (time - burstAt - i * 30) / 550));
            if (p === 0 || p === 1) continue;
            ctx.beginPath();
            ctx.arc(
              from.x! + (to.x! - from.x!) * p,
              from.y! + (to.y! - from.y!) * p - Math.sin(p * Math.PI) * 50,
              3 + Math.sin(i) * 1.4,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = rowMap.get(burst.from)?.color ?? '#d6efbc';
            ctx.fill();
          }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      simulation.stop();
    };
  }, [reset]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function hit(x: number, y: number, exclude?: string) {
    return (
      [...nodesRef.current]
        .reverse()
        .find((b) => b.symbol !== exclude && Math.hypot(b.x! - x, b.y! - y) <= b.r * 1.06)
        ?.symbol ?? null
    );
  }
  return (
    <div className="blob-stage">
      <canvas
        ref={canvasRef}
        aria-label="Portfolio allocation field. Accessible holdings and transfer controls follow."
        tabIndex={0}
        style={{ cursor: drag.current ? 'grabbing' : hover ? 'grab' : 'default' }}
        onPointerDown={(e) => {
          const p = point(e),
            symbol = hit(p.x, p.y);
          if (!symbol) return;
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          current.current.onSelect(symbol);
          drag.current = { from: symbol, ...p, startX: p.x, startY: p.y, moved: false };
        }}
        onPointerMove={(e) => {
          const p = point(e),
            d = drag.current;
          if (d) {
            Object.assign(d, p);
            d.moved ||= Math.hypot(p.x - d.startX, p.y - d.startY) > 8;
          }
          const symbol = hit(p.x, p.y, d?.from);
          hoverRef.current = symbol;
          setHover(symbol);
        }}
        onPointerUp={(e) => {
          const p = point(e),
            d = drag.current;
          const target = hit(p.x, p.y, d?.from);
          if (d?.moved && target) current.current.onPour(d.from, target);
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          if (!drag.current) {
            hoverRef.current = null;
            setHover(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.code === 'Escape') drag.current = null;
          if (e.code === 'Space') {
            e.preventDefault();
            if (hoverRef.current && hoverRef.current !== selected)
              onPour(selected, hoverRef.current);
          }
        }}
      />
      <div className="field-coordinate top-left">01 / ALLOCATION</div>
      <div className="field-coordinate bottom-right">USD · AREA = VALUE</div>
      {rows.length === 0 && (
        <div className="field-empty">
          <div className="empty-orbit" />
          <strong>Waiting for market data</strong>
          <span>Starter capital · $25,000.00</span>
        </div>
      )}
      {hover && (
        <div className="hover-caption">
          <span className="status-dot" />
          {hover === CASH ? 'US Dollar' : rows.find((r) => r.symbol === hover)?.name}
        </div>
      )}
    </div>
  );
}
