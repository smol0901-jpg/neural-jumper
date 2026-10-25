/* 2.5D canvas renderer — perspective, shadows, parallax, volume */
import { W, H, COLORS } from './config.js';
import { roundRect } from './utils.js';

/** Perspective scale based on vertical position (higher = farther / smaller) */
function depthScale(y, camY = 0) {
  // platforms higher on screen feel slightly farther
  const t = (y - camY) / H;
  return 0.92 + t * 0.12;
}

/** Horizontal perspective shift (subtle vanishing) */
function perspectiveX(x, y, cx = W / 2) {
  const t = (y / H - 0.5) * 0.04;
  return x + (x - cx) * t;
}

export function drawFrame(ctx, state, mode) {
  const { player, platforms, starfield, score, level, urgency, gameOver, currentTarget, currentSafe, activeFeatures } = state;

  // deep space background with subtle level tint
  const lightness = 5 + Math.min(5, level * 0.1);
  ctx.fillStyle = `hsl(215, 28%, ${lightness}%)`;
  ctx.fillRect(0, 0, W, H);

  // soft vignette
  const vig = ctx.createRadialGradient(W / 2, H * 0.4, 80, W / 2, H * 0.45, 420);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // parallax star layers
  const layers = [
    { speed: 0.12, alpha: 0.08, size: 1.0 },
    { speed: 0.22, alpha: 0.12, size: 1.3 },
    { speed: 0.35, alpha: 0.16, size: 1.7 }
  ];
  for (const s of starfield) {
    const L = layers[s.layer] || layers[0];
    const y = ((s.y + score * L.speed * s.s) % H + H) % H;
    const x = perspectiveX(s.x, y);
    ctx.fillStyle = `rgba(160, 200, 255, ${L.alpha})`;
    const r = s.r * L.size;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // subtle grid (fades with depth)
  ctx.strokeStyle = 'rgba(255,255,255,0.018)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 28) {
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, H);
    ctx.stroke();
  }

  // AI target line
  if (mode === 'ai' && currentTarget && !gameOver) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(currentTarget.x + currentTarget.w / 2, currentTarget.y);
    ctx.stroke();
    ctx.restore();
  }

  // platforms — sorted by y for simple depth order (far first)
  const sorted = [...platforms].sort((a, b) => a.y - b.y);

  for (const p of sorted) {
    const scale = depthScale(p.y);
    const px = perspectiveX(p.x + p.w / 2, p.y) - (p.w * scale) / 2;
    const pw = p.w * scale;
    const ph = p.h * (0.85 + scale * 0.15);
    const py = p.y;

    const isT = mode === 'ai' && p === currentTarget;
    const isS = p === currentSafe && urgency > 0.8;

    let stroke = COLORS.graphite;
    if (isS) stroke = COLORS.amber;
    else if (isT) stroke = COLORS.cyan;
    else if (p.spring) stroke = '#65a30d';

    const alpha = p.vanishing && p.touched ? Math.max(0.1, p.life) : 1;

    // drop shadow (2.5D)
    ctx.save();
    ctx.globalAlpha = 0.22 * alpha;
    ctx.fillStyle = '#000';
    roundRect(ctx, px + 4, py + 5, pw, ph + 2, 3);
    ctx.fill();
    ctx.restore();

    // platform body with vertical gradient for volume
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    grad.addColorStop(0, '#1a2433');
    grad.addColorStop(0.5, '#121821');
    grad.addColorStop(1, '#0c121a');
    ctx.fillStyle = grad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isT || isS ? 1.9 : 1.15;
    if (p.vanishing && !p.touched) ctx.setLineDash([3, 3]);
    roundRect(ctx, px, py, pw, ph, 3);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // top highlight edge
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 3, py + 1);
    ctx.lineTo(px + pw - 3, py + 1);
    ctx.stroke();

    // spring gem
    if (p.spring) {
      ctx.fillStyle = COLORS.lime;
      ctx.shadowColor = COLORS.lime;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px + pw / 2, py + ph / 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // target ring
    if (isT) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(px + pw / 2, py + 5, pw / 2 + 8, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // flash
    if (p.flash > 0.03) {
      ctx.strokeStyle = `rgba(255,255,255,${p.flash * 0.55})`;
      ctx.lineWidth = 1 + p.flash * 2.4;
      roundRect(ctx, px, py, pw, ph, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // darkness fog
  if (activeFeatures.has('dark') && !gameOver) {
    const radius = Math.max(170, 310 - level * 3);
    const g = ctx.createRadialGradient(player.x, player.y, 45, player.x, player.y, radius);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // player with shadow + 2.5D diamond
  const px = player.x;
  const py = player.y;

  // player shadow
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(px + 3, py + player.h / 2 + 6, player.w * 0.45, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // body
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI / 4);
  const bodyGrad = ctx.createLinearGradient(-14, -14, 14, 14);
  bodyGrad.addColorStop(0, gameOver ? '#fda4af' : '#67e8f9');
  bodyGrad.addColorStop(1, gameOver ? '#e11d48' : '#0891b2');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#0a0e13';
  ctx.lineWidth = 1.7;
  ctx.shadowColor = gameOver ? COLORS.rose : COLORS.cyan;
  ctx.shadowBlur = 12;
  ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
  ctx.shadowBlur = 0;
  ctx.strokeRect(-player.w / 2, -player.h / 2, player.w, player.h);
  ctx.restore();

  // jump ready ring
  ctx.beginPath();
  ctx.arc(px, py, player.w / 2 + 8, 0, Math.PI * 2);
  ctx.strokeStyle = player.jumpsLeft > 0 ? 'rgba(163,230,53,0.55)' : 'rgba(100,116,139,0.28)';
  ctx.lineWidth = player.jumpsLeft > 0 ? 1.8 : 1;
  ctx.stroke();

  // velocity trail
  if (!gameOver) {
    ctx.strokeStyle = 'rgba(34,211,238,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + player.vx * 3.3, py + player.vy * 1.9);
    ctx.stroke();
  }

  // urgency frame
  if (urgency > 0.35 && !gameOver) {
    ctx.strokeStyle = urgency > 0.85 ? COLORS.rose : COLORS.amber;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = urgency * 0.85;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.globalAlpha = 1;
  }
}
