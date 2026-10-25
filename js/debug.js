/**
 * AI Debug harness — grid overlay, decision telemetry, 10-run auto batch, report export.
 */
import { W, H, JUMP, GRAV, MAXVX, VERSION } from './config.js';

const MAX_JUMP_H = (JUMP * JUMP) / (2 * GRAV);

export function createDebugState() {
  return {
    enabled: false,
    batchMode: false,
    batchTarget: 10,
    batchIndex: 0,
    runs: [],
    current: null, // active run log
    gridStep: 40,
    showGrid: true,
    lastAction: null,
    lastReason: '',
    frameLogEvery: 15 // subsample continuous frames
  };
}

export function startRun(dbg, levelSeed = 0) {
  dbg.current = {
    runId: dbg.batchIndex + 1,
    startedAt: Date.now(),
    endedAt: null,
    reason: null,
    score: 0,
    level: 1,
    jumps: 0,
    doubleJumps: 0,
    kills: 0,
    platformsLanded: 0,
    uniquePlatforms: new Set(),
    decisions: [],
    landings: [],
    deaths: null,
    samples: [], // periodic physics snapshots
    maxDxBetweenJumps: 0,
    maxDyBetweenJumps: 0,
    sumJumpDx: 0,
    sumJumpDy: 0
  };
  return dbg.current;
}

export function logDecision(dbg, state, action, meta = {}) {
  if (!dbg.enabled || !dbg.current) return;
  const p = state.player;
  const t = state.currentTarget;
  const entry = {
    f: state.frame,
    t: Date.now() - dbg.current.startedAt,
    action,
    actionName: ['LEFT', 'STAY', 'RIGHT', 'DOUBLE', 'FIRE'][action] || String(action),
    reason: meta.reason || dbg.lastReason || '',
    player: {
      x: round(p.x), y: round(p.y),
      vx: round(p.vx, 2), vy: round(p.vy, 2),
      jumpsLeft: p.jumpsLeft, hp: p.hp
    },
    target: t ? {
      id: platformId(t),
      x: round(t.x), y: round(t.y), w: round(t.w),
      cx: round(t.x + t.w / 2),
      dx: round((t.x + t.w / 2) - p.x, 1),
      dy: round(p.y - t.y, 1),
      kind: t.kind || (t.boost ? 'boost' : t.spring ? 'spring' : 'normal'),
      moving: !!t.moveAmp
    } : null,
    urgency: round(state.urgency || 0, 2),
    visibleAbove: countAbove(state.platforms, p.y),
    reachableHint: meta.reach || null
  };
  dbg.current.decisions.push(entry);
  // keep memory bounded
  if (dbg.current.decisions.length > 4000) dbg.current.decisions.shift();
  dbg.lastAction = entry.actionName;
  dbg.lastReason = entry.reason;
}

export function logLanding(dbg, state, platform) {
  if (!dbg.enabled || !dbg.current) return;
  const p = state.player;
  const id = platformId(platform);
  dbg.current.platformsLanded++;
  dbg.current.uniquePlatforms.add(id);
  const prev = dbg.current.landings[dbg.current.landings.length - 1];
  const dx = prev ? Math.abs((platform.x + platform.w / 2) - prev.cx) : 0;
  const dy = prev ? Math.abs(prev.y - platform.y) : 0;
  dbg.current.maxDxBetweenJumps = Math.max(dbg.current.maxDxBetweenJumps, dx);
  dbg.current.maxDyBetweenJumps = Math.max(dbg.current.maxDyBetweenJumps, dy);
  dbg.current.sumJumpDx += dx;
  dbg.current.sumJumpDy += dy;
  dbg.current.landings.push({
    f: state.frame,
    t: Date.now() - dbg.current.startedAt,
    id,
    x: round(platform.x),
    y: round(platform.y),
    w: round(platform.w),
    cx: round(platform.x + platform.w / 2),
    playerX: round(p.x),
    playerY: round(p.y),
    vx: round(p.vx, 2),
    vy: round(p.vy, 2),
    score: state.score,
    dxFromPrev: round(dx, 1),
    dyFromPrev: round(dy, 1),
    kind: platform.kind || 'normal'
  });
}

export function logSample(dbg, state) {
  if (!dbg.enabled || !dbg.current) return;
  if (state.frame % dbg.frameLogEvery !== 0) return;
  const p = state.player;
  dbg.current.samples.push({
    f: state.frame,
    x: round(p.x), y: round(p.y),
    vx: round(p.vx, 2), vy: round(p.vy, 2),
    score: state.score
  });
  if (dbg.current.samples.length > 2000) dbg.current.samples.shift();
}

export function endRun(dbg, state, reason) {
  if (!dbg.current) return null;
  const run = dbg.current;
  run.endedAt = Date.now();
  run.durationMs = run.endedAt - run.startedAt;
  run.reason = reason;
  run.score = state.score;
  run.level = state.level;
  run.jumps = state.jumps;
  run.doubleJumps = state.doubleJumps;
  run.kills = state.kills || 0;
  run.uniquePlatformCount = run.uniquePlatforms.size;
  run.avgDx = run.platformsLanded > 1 ? round(run.sumJumpDx / (run.platformsLanded - 1), 1) : 0;
  run.avgDy = run.platformsLanded > 1 ? round(run.sumJumpDy / (run.platformsLanded - 1), 1) : 0;
  // serialize Set
  run.uniquePlatformList = [...run.uniquePlatforms];
  delete run.uniquePlatforms;
  dbg.runs.push(run);
  dbg.current = null;
  return run;
}

export function buildReport(dbg) {
  const MAX_JUMP = round(MAX_JUMP_H, 1);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      version: VERSION,
      canvas: { W, H },
      physics: {
        GRAV, JUMP, MAXVX,
        maxJumpHeightPx: Math.round((JUMP * JUMP) / (2 * GRAV)),
        approxMaxReachX: Math.round(MAXVX * (Math.abs(JUMP) / GRAV) * 0.95),
        version: VERSION
      },
      batchSize: dbg.runs.length,
      gridStep: dbg.gridStep
    },
    summary: {
      runs: dbg.runs.length,
      scores: dbg.runs.map(r => r.score),
      avgScore: avg(dbg.runs.map(r => r.score)),
      bestScore: Math.max(0, ...dbg.runs.map(r => r.score)),
      avgLandings: avg(dbg.runs.map(r => r.platformsLanded)),
      avgDurationMs: avg(dbg.runs.map(r => r.durationMs)),
      deathReasons: countBy(dbg.runs.map(r => r.reason))
    },
    runs: dbg.runs.map(r => ({
      runId: r.runId,
      score: r.score,
      level: r.level,
      reason: r.reason,
      durationMs: r.durationMs,
      jumps: r.jumps,
      doubleJumps: r.doubleJumps,
      platformsLanded: r.platformsLanded,
      uniquePlatforms: r.uniquePlatformCount,
      avgDxBetweenLandings: r.avgDx,
      avgDyBetweenLandings: r.avgDy,
      maxDxBetweenLandings: round(r.maxDxBetweenJumps, 1),
      maxDyBetweenLandings: round(r.maxDyBetweenJumps, 1),
      landings: r.landings,
      // last 80 decisions (full set can be huge)
      decisionsTail: r.decisions.slice(-80),
      decisionsCount: r.decisions.length,
      samplesTail: r.samples.slice(-40)
    }))
  };
  return report;
}

export function reportToText(report) {
  const lines = [];
  lines.push('=== NEURAL ASCENT AI DEBUG REPORT ===');
  lines.push(`Generated: ${report.meta.generatedAt}`);
  lines.push(`Canvas: ${report.meta.canvas.W}x${report.meta.canvas.H}`);
  lines.push(`Max jump height: ${report.meta.physics.maxJumpHeightPx}px`);
  lines.push(`Approx max reach X: ${report.meta.physics.approxMaxReachX}px`);
  lines.push('');
  lines.push('--- SUMMARY ---');
  lines.push(`Runs: ${report.summary.runs}`);
  lines.push(`Scores: [${report.summary.scores.join(', ')}]`);
  lines.push(`Avg score: ${report.summary.avgScore}`);
  lines.push(`Best: ${report.summary.bestScore}`);
  lines.push(`Avg landings: ${report.summary.avgLandings}`);
  lines.push(`Deaths: ${JSON.stringify(report.summary.deathReasons)}`);
  lines.push('');
  for (const r of report.runs) {
    lines.push(`======== RUN #${r.runId} score=${r.score} lvl=${r.level} reason=${r.reason} ========`);
    lines.push(`duration=${r.durationMs}ms jumps=${r.jumps} doubles=${r.doubleJumps} landings=${r.platformsLanded} unique=${r.uniquePlatforms}`);
    lines.push(`avgDx=${r.avgDxBetweenLandings} avgDy=${r.avgDyBetweenLandings} maxDx=${r.maxDxBetweenLandings} maxDy=${r.maxDyBetweenLandings}`);
    lines.push('-- landings --');
    for (const L of r.landings) {
      lines.push(`  f=${L.f} id=${L.id} plat=(${L.x},${L.y},w${L.w}) player=(${L.playerX},${L.playerY}) v=(${L.vx},${L.vy}) dPrev=(${L.dxFromPrev},${L.dyFromPrev}) score=${L.score}`);
    }
    lines.push('-- decisions (tail) --');
    for (const d of r.decisionsTail) {
      const tg = d.target
        ? `tgt=${d.target.id}@(${d.target.cx},${d.target.y}) dx=${d.target.dx} dy=${d.target.dy}`
        : 'tgt=none';
      lines.push(`  f=${d.f} ${d.actionName} ${tg} player=(${d.player.x},${d.player.y}) v=(${d.player.vx},${d.player.vy}) urg=${d.urgency} above=${d.visibleAbove} ${d.reason}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Draw pixel grid + platform IDs + HUD debug */
export function drawDebugOverlay(ctx, state, dbg) {
  if (!dbg.enabled) return;
  const step = dbg.gridStep;

  if (dbg.showGrid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,211,238,0.12)';
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(34,211,238,0.35)';
    for (let x = 0; x <= W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillText(String(x), x + 2, 10);
    }
    for (let y = 0; y <= H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillText(String(y), 2, y + 10);
    }
    ctx.restore();
  }

  // platform IDs + reach color
  const p = state.player;
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  for (const plat of state.platforms) {
    if (plat.y < -20 || plat.y > H + 20) continue;
    const id = platformId(plat);
    const cx = plat.x + plat.w / 2;
    const dy = p.y - plat.y;
    const dx = Math.abs(cx - p.x);
    let col = 'rgba(148,163,184,0.7)';
    if (dy > 5 && dy < MAX_JUMP_H * 0.92 && dx < 160) col = 'rgba(163,230,53,0.9)';
    else if (dy > 5 && dy < MAX_JUMP_H * 1.7 && dx < 200) col = 'rgba(251,191,36,0.85)';
    else if (dy > 5) col = 'rgba(251,113,133,0.75)';
    ctx.fillStyle = col;
    ctx.fillText(id, cx, plat.y - 4);
    ctx.fillText(`${Math.round(dx)}×${Math.round(dy)}`, cx, plat.y + plat.h + 10);
  }
  ctx.restore();

  // player crosshair coords
  ctx.save();
  ctx.strokeStyle = 'rgba(34,211,238,0.6)';
  ctx.beginPath();
  ctx.moveTo(p.x - 20, p.y); ctx.lineTo(p.x + 20, p.y);
  ctx.moveTo(p.x, p.y - 20); ctx.lineTo(p.x, p.y + 20);
  ctx.stroke();
  ctx.fillStyle = '#22d3ee';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`(${Math.round(p.x)},${Math.round(p.y)}) vx=${p.vx.toFixed(1)} vy=${p.vy.toFixed(1)}`, p.x + 14, p.y - 14);
  ctx.restore();

  // debug HUD panel
  const ld = state._lastDecision;
  const actName = dbg.lastAction || (ld ? ['LEFT','STAY','RIGHT','DOUBLE','FIRE'][ld.action] : '-');
  const why = dbg.lastReason || (ld && ld.reason) || '';
  const lines = [
    `DEBUG AI  run ${dbg.batchMode ? (dbg.batchIndex + 1) + '/' + dbg.batchTarget : 'live'}`,
    `action: ${actName}  ${why}`.slice(0, 48),
    `score ${state.score}  landings ${dbg.current ? dbg.current.platformsLanded : 0}`,
    `target: ${state.currentTarget ? platformId(state.currentTarget) : 'none'}`,
    `urgency ${(state.urgency || 0).toFixed(2)}  above ${countAbove(state.platforms, p.y)}`
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(5,8,14,0.75)';
  ctx.fillRect(6, H - 78, 210, 70);
  ctx.fillStyle = '#67e8f9';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  lines.forEach((ln, i) => ctx.fillText(ln, 12, H - 64 + i * 12));
  ctx.restore();
}

function platformId(p) {
  // stable-ish id from position
  return `P${Math.round(p.y)}:${Math.round(p.x)}`;
}

function countAbove(platforms, py) {
  let n = 0;
  for (const p of platforms) if (p.y < py - 8 && p.y > py - 450) n++;
  return n;
}

function round(v, d = 0) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

function avg(arr) {
  if (!arr.length) return 0;
  return round(arr.reduce((a, b) => a + b, 0) / arr.length, 1);
}

function countBy(arr) {
  const o = {};
  for (const x of arr) o[x] = (o[x] || 0) + 1;
  return o;
}
