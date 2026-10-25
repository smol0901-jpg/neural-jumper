import { W, H, COLORS } from './config.js';
import { roundRect } from './utils.js';

function depthScale(y) {
  const t = y / H;
  return 0.9 + t * 0.14;
}
function perspectiveX(x, y, cx = W / 2) {
  const t = (y / H - 0.5) * 0.045;
  return x + (x - cx) * t;
}

/** Draw cyber pilot character */
function drawPilot(ctx, px, py, facing, invuln, gameOver) {
  ctx.save();
  ctx.translate(px, py);
  if (facing < 0) ctx.scale(-1, 1);

  // jet glow
  if (!gameOver) {
    ctx.fillStyle = 'rgba(34,211,238,0.35)';
    ctx.beginPath();
    ctx.moveTo(-6, 12); ctx.lineTo(0, 22 + Math.sin(Date.now()/80)*3); ctx.lineTo(6, 12);
    ctx.fill();
  }

  // body capsule
  const g = ctx.createLinearGradient(-10, -14, 10, 14);
  g.addColorStop(0, gameOver ? '#fda4af' : '#67e8f9');
  g.addColorStop(0.5, gameOver ? '#e11d48' : '#22d3ee');
  g.addColorStop(1, gameOver ? '#9f1239' : '#0e7490');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#0a0e13';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = gameOver ? COLORS.rose : COLORS.cyan;
  ctx.shadowBlur = invuln > 0 && Math.floor(invuln / 4) % 2 ? 0 : 14;

  // torso
  roundRect(ctx, -9, -6, 18, 16, 5);
  ctx.fill(); ctx.stroke();

  // helmet
  ctx.beginPath();
  ctx.arc(0, -10, 10, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // visor
  ctx.shadowBlur = 0;
  ctx.fillStyle = gameOver ? '#fff' : '#ecfeff';
  ctx.beginPath();
  ctx.ellipse(2, -10, 6, 4, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(8,20,40,0.55)';
  ctx.beginPath();
  ctx.ellipse(3, -10, 4, 2.5, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // side thrusters
  ctx.fillStyle = '#164e63';
  roundRect(ctx, -13, 0, 5, 8, 2); ctx.fill();
  roundRect(ctx, 8, 0, 5, 8, 2); ctx.fill();

  ctx.restore();
}

export function drawFrame(ctx, state, mode) {
  const { player, platforms, starfield, score, level, urgency, gameOver,
    currentTarget, currentSafe, activeFeatures, enemies, bullets } = state;

  const lightness = 4.5 + Math.min(5, level * 0.09);
  ctx.fillStyle = `hsl(218, 32%, ${lightness}%)`;
  ctx.fillRect(0, 0, W, H);

  // 4 parallax layers
  const layers = [
    { speed: 0.08, alpha: 0.06, size: 0.8 },
    { speed: 0.16, alpha: 0.10, size: 1.1 },
    { speed: 0.28, alpha: 0.14, size: 1.4 },
    { speed: 0.42, alpha: 0.20, size: 1.8 }
  ];
  for (const s of starfield) {
    const L = layers[s.layer % 4];
    const y = ((s.y + score * L.speed * s.s) % H + H) % H;
    const x = perspectiveX(s.x, y);
    ctx.fillStyle = `rgba(170, 210, 255, ${L.alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, s.r * L.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // vignette
  const vig = ctx.createRadialGradient(W/2, H*0.4, 60, W/2, H*0.45, 400);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (mode === 'ai' && currentTarget && !gameOver) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.2)';
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(currentTarget.x + currentTarget.w/2, currentTarget.y);
    ctx.stroke();
    ctx.restore();
  }

  const sorted = [...platforms].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    const scale = depthScale(p.y);
    const px = perspectiveX(p.x + p.w/2, p.y) - (p.w * scale)/2;
    const pw = p.w * scale;
    const ph = p.h * (0.85 + scale * 0.15);
    const py = p.y;
    const isT = mode === 'ai' && p === currentTarget;
    const isS = p === currentSafe && urgency > 0.8;
    let stroke = COLORS.graphite;
    if (isS) stroke = COLORS.amber;
    else if (isT) stroke = COLORS.cyan;
    else if (p.boost) stroke = COLORS.boost;
    else if (p.spring) stroke = '#65a30d';
    const alpha = p.vanishing && p.touched ? Math.max(0.1, p.life) : 1;

    ctx.save();
    ctx.globalAlpha = 0.2 * alpha;
    ctx.fillStyle = '#000';
    roundRect(ctx, px + 4, py + 5, pw, ph + 2, 3);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(px, py, px, py + ph);
    if (p.boost) {
      grad.addColorStop(0, '#422006');
      grad.addColorStop(1, '#78350f');
    } else {
      grad.addColorStop(0, '#1a2433');
      grad.addColorStop(1, '#0c121a');
    }
    ctx.fillStyle = grad;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isT || isS || p.boost ? 1.9 : 1.1;
    if (p.vanishing && !p.touched) ctx.setLineDash([3, 3]);
    roundRect(ctx, px, py, pw, ph, 3);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);

    if (p.spring) {
      ctx.fillStyle = COLORS.lime;
      ctx.beginPath();
      ctx.arc(px + pw/2, py + ph/2, 2.5, 0, Math.PI*2);
      ctx.fill();
    }
    if (p.boost) {
      ctx.fillStyle = COLORS.boost;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲', px + pw/2, py + ph - 1);
    }
    if (isT) {
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.ellipse(px + pw/2, py + 5, pw/2 + 8, 10, 0, 0, Math.PI*2);
      ctx.stroke();
    }
    if (p.flash > 0.03) {
      ctx.strokeStyle = `rgba(255,255,255,${p.flash*0.5})`;
      ctx.lineWidth = 1 + p.flash * 2;
      roundRect(ctx, px, py, pw, ph, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // enemies
  for (const e of enemies || []) {
    if (e.dead) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = e.flash > 0.2 ? '#fff' : COLORS.enemy;
    ctx.shadowColor = COLORS.enemy;
    ctx.shadowBlur = 10;
    // hostile diamond
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-8, -8, 16, 16);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#0a0e13';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.restore();
  }

  // bullets
  for (const b of bullets || []) {
    if (b.dead) continue;
    ctx.fillStyle = COLORS.bullet;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (activeFeatures.has('dark') && !gameOver) {
    const radius = Math.max(160, 300 - level * 3);
    const g = ctx.createRadialGradient(player.x, player.y, 40, player.x, player.y, radius);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // player shadow
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(player.x + 2, player.y + 16, 12, 4, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  drawPilot(ctx, player.x, player.y, player.facing || 1, player.invuln || 0, gameOver);

  // jump ring
  ctx.beginPath();
  ctx.arc(player.x, player.y, 18, 0, Math.PI*2);
  ctx.strokeStyle = player.jumpsLeft > 0 ? 'rgba(163,230,53,0.5)' : 'rgba(100,116,139,0.25)';
  ctx.lineWidth = player.jumpsLeft > 0 ? 1.6 : 1;
  ctx.stroke();

  // HP pips
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < (player.hp || 0) ? COLORS.lime : 'rgba(100,116,139,0.3)';
    ctx.fillRect(8 + i * 12, H - 16, 10, 6);
  }

  if (urgency > 0.35 && !gameOver) {
    ctx.strokeStyle = urgency > 0.85 ? COLORS.rose : COLORS.amber;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = urgency * 0.85;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.globalAlpha = 1;
  }
}
