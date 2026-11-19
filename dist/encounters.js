'use strict';

const PLAYER_HAZARD_RADIUS = 8;
const SHOCKWAVE_HALF_WIDTH = 10;
const MID_BOSSES = {
  0: { wave:5, kind:'bulwark', score:220 },
  2: { wave:5, kind:'prism', score:480 }
};
const GUARD_BOSSES = {
  bulwark: { n:'铁壁哨卫', t:'战区守卫 · 离开震击圈，侧向躲开冲撞', hp:1050, r:30, h:52, spd:105, dmg:18, col:'#ffd067', sprite:'crusher' },
  prism: { n:'棱镜枢机', t:'战区守卫 · 在光束之间寻找空位', hp:3200, r:28, h:50, spd:94, dmg:22, col:'#9df4df', sprite:'hive', floating:true }
};
const GUARD_PHASES = {
  bulwark: { phases:[
    { hpThreshold:1, timeThreshold:0, nm:'锁地震击', msg:'脚下蓄力圈出现后向外撤', acts:['guardStomp','shell'], move:'press' },
    { hpThreshold:.52, timeThreshold:28, nm:'破甲反击', msg:'震击范围扩大 · 加入短程撞击', acts:['guardRam','guardStomp','shells'], move:'press', cdMul:.8 }
  ] },
  prism: { phases:[
    { hpThreshold:1, timeThreshold:0, nm:'分光射击', msg:'两束平行光之间可以穿过', acts:['prismFork','prismSummon'], move:'orbit', keep:208 },
    { hpThreshold:.55, timeThreshold:37, nm:'棱镜阵列', msg:'横移避开三道锁定光束', acts:['prismLattice','prismSummon','prismFork'], move:'orbit', keep:165, cdMul:.82 }
  ] }
};
const GUARD_ACTIONS = {
  bulwark:['guardStomp','guardRam','shells'],
  prism:['prismFork','prismSummon','prismLattice']
};
const GUARD_ATTACKS = {
  guardStomp(b){
    const radius = b.ph ? 126 : 106;
    const wind = b.ph ? .94 : 1.04;
    const x = b.x, y = b.y;
    return {
      wind:wind, dur:.46, cd:1.08,
      draw(g){ if(!b.act.fired) drawHazardCircle(g, x, y, radius, '#ffbd56', b.act.t / wind); },
      fire(){ resolveGroundBlast(x, y, radius, b.dmg); }
    };
  },
  guardRam(b){
    return makeBossCharge(b, { wind:.76, dur:.40, cd:1.14, len:154, col:'#ffbb54' });
  },
  prismFork(b){
    const a = Math.atan2(G.p.y - b.y, G.p.x - b.x);
    const nx = -Math.sin(a), ny = Math.cos(a);
    const beams = [-35, 35].map(offset => ({
      x:b.x + nx * offset, y:b.y + ny * offset, ang:a, len:690, wide:12, dmg:17, life:.62, rot:0, col:'#9df4df'
    }));
    return makeBossLaser(b, 1.04, 1.35, beams);
  },
  prismLattice(b){
    const a = Math.atan2(G.p.y - b.y, G.p.x - b.x);
    const beams = [-.36, 0, .36].map(off => ({
      x:b.x, y:b.y, ang:a + off, len:770, wide:11, dmg:19, life:.58, rot:0, col:'#9df4df'
    }));
    return makeBossLaser(b, 1.14, 1.5, beams);
  },
  prismSummon(b){
    const a = Math.atan2(G.p.y - b.y, G.p.x - b.x) + Math.PI / 2;
    const points = [-1, 1].map(sign => ({
      x:clamp(b.x + Math.cos(a) * 87 * sign, 50, ARENA.w - 50),
      y:clamp(b.y + Math.sin(a) * 87 * sign, 60, ARENA.h - 50)
    }));
    return {
      wind:.86, dur:.4, cd:1.7,
      draw(g){
        if(!b.act.fired){
          for(const pt of points) drawHazardCircle(g, pt.x, pt.y, 19, '#9df4df', b.act.t / b.act.wind);
        }
      },
      fire(){
        let slots = partnerSlots(b, 2);
        for(const pt of points){
          if(slots-- <= 0) break;
          spawnEnemy('drone', pt.x, pt.y, { noElite:true }).summoner = b;
        }
        SFX.shoot();
      }
    };
  }
};

function queueMidBoss(){
  const guard = MID_BOSSES[G.stage];
  if(!guard || G.wave !== guard.wave || G.clearedGuards.has(guard.kind)) return false;
  startBoss(guard.kind, G.wave + 1);
  return true;
}

function bossSpawnPoint(){
  const x = ARENA.w / 2, y = ARENA.h * .28;
  if(!G.p || d2(G.p.x, G.p.y, x, y) >= 168 ** 2) return { x:x, y:y };
  const direction = G.p.y < ARENA.h / 2 ? 1 : -1;
  return { x:x, y:clamp(G.p.y + direction * 218, 90, ARENA.h - 90) };
}

function partnerSlots(b, cap){
  let count = 0;
  for(const e of G.enemies){
    if(!e.dead && e.summoner === b) count++;
  }
  return Math.max(0, Math.min(cap - count, ENEMY_CAP - G.enemies.length));
}

function encounterDistanceSq(px, py, x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? clamp(((px - x0) * dx + (py - y0) * dy) / lengthSq, 0, 1) : 0;
  return d2(px, py, x0 + dx * t, y0 + dy * t);
}

function playerAlongEncounterStep(t){
  const p = G.p;
  const from = G.encounterPlayerFrom;
  return from ? { x:lerp(from.x, p.x, t), y:lerp(from.y, p.y, t) } : p;
}

function chargeEndpoint(x, y, angle, length){
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const xLimit = dx > 0 ? (ARENA.w - 58 - x) / dx : dx < 0 ? (58 - x) / dx : Infinity;
  const yLimit = dy > 0 ? (ARENA.h - 62 - y) / dy : dy < 0 ? (68 - y) / dy : Infinity;
  const travel = Math.max(0, Math.min(length, xLimit, yLimit));
  return { x:x + dx * travel, y:y + dy * travel };
}

function makeBossCharge(b, spec){
  const sx = b.x, sy = b.y;
  const angle = Math.atan2(G.p.y - sy, G.p.x - sx);
  const target = chargeEndpoint(sx, sy, angle, spec.len);
  return {
    wind:spec.wind, dur:spec.dur, cd:spec.cd, kind:'charge',
    draw(g){
      if(!b.act.fired) drawEncounterLane(g, sx, sy, target.x, target.y, b.r, spec.col, true, 0);
    },
    fire(){
      G.shake = Math.max(G.shake, 6);
      SFX.heavy();
      if(spec.side){
        ebAim(sx, sy, angle + Math.PI / 2, spec.side, .17, 235, 12, '#ff9a74', 4);
        ebAim(sx, sy, angle - Math.PI / 2, spec.side, .17, 235, 12, '#ff9a74', 4);
      }
    },
    tick(unit, action, dt){
      if(!action.fired) return;
      const elapsed = action.t - action.wind;
      const previous = clamp((elapsed - dt) / action.dur, 0, 1);
      const next = clamp(elapsed / action.dur, 0, 1);
      const t0 = dt ? clamp(1 - elapsed / dt, 0, 1) : 1;
      const t1 = dt ? clamp(1 + (action.dur - elapsed) / dt, 0, 1) : 1;
      const p0 = playerAlongEncounterStep(t0), p1 = playerAlongEncounterStep(t1);
      const x0 = lerp(sx, target.x, previous), y0 = lerp(sy, target.y, previous);
      unit.x = lerp(sx, target.x, next);
      unit.y = lerp(sy, target.y, next);
      if(!action.hit && encounterDistanceSq(0, 0, p0.x - x0, p0.y - y0,
        p1.x - unit.x, p1.y - unit.y) <= (b.r + PLAYER_HAZARD_RADIUS) ** 2){
        action.hit = true;
        hurtPlayer(b.dmg);
      }
      if(Math.random() < dt * 24) spark(unit.x, unit.y, 2, spec.col, 56);
    },
    end(){
      if(spec.afterRing){
        ebRing(b.x, b.y, spec.afterRing, 170, 12, '#ff9a74', 4.2, angle + .25);
        spark(b.x, b.y, 8, '#ff9a74', 86);
        SFX.shoot();
      }
    }
  };
}

function makeBossLaser(b, wind, cooldown, beams){
  return {
    wind:wind, dur:Math.max(...beams.map(spec => spec.life)), cd:cooldown,
    draw(g){
      if(!b.act.fired){
        for(const beam of beams) drawEncounterBeam(g, beam, true);
      }
    },
    fire(){
      for(const beam of beams) addBeam(beam.x, beam.y, beam.ang, beam.len, beam.wide, beam.dmg, beam.life, beam.rot, beam.col);
      SFX.heavy();
    }
  };
}

function resolveGroundBlast(x, y, radius, dmg){
  if(d2(G.p.x, G.p.y, x, y) <= (radius + PLAYER_HAZARD_RADIUS) ** 2) hurtPlayer(dmg);
  explodeFX(x, y, radius);
  SFX.boom();
}

function advanceEncounterBeam(h, dt){
  const duration = Math.max(0, Math.min(dt, h.life + dt));
  const before = h.ang;
  h.ang += h.rot * duration;
  const p0 = h.born === G.t ? G.p : playerAlongEncounterStep(0);
  const p1 = h.born === G.t || !dt ? G.p : playerAlongEncounterStep(duration / dt);
  const hitRadius = h.wide + PLAYER_HAZARD_RADIUS;
  const reach = Math.min(h.len + hitRadius, Math.max(dst(h.x, h.y, p0.x, p0.y), dst(h.x, h.y, p1.x, p1.y)));
  const travel = Math.abs(h.ang - before) * reach + dst(p0.x, p0.y, p1.x, p1.y);
  const samples = Math.max(1, Math.ceil(travel / Math.max(2, h.wide * .33)));
  for(let i=0;i<=samples;i++){
    const t = i / samples;
    const angle = lerp(before, h.ang, t);
    const x = lerp(p0.x, p1.x, t), y = lerp(p0.y, p1.y, t);
    const bx = h.x + Math.cos(angle) * h.len, by = h.y + Math.sin(angle) * h.len;
    if(encounterDistanceSq(x, y, h.x, h.y, bx, by) <= hitRadius ** 2){
      hurtPlayer(h.dmg);
      break;
    }
  }
}

function advanceEncounterWave(h, dt){
  const growth = clamp(h.t / h.max, 0, 1);
  const oldRadius = h.r;
  h.r = lerp(4, h.maxR, growth * (2 - growth));
  if(h.hit) return;
  const p0 = h.born === G.t ? G.p : playerAlongEncounterStep(0);
  const p1 = h.born === G.t || !dt ? G.p : playerAlongEncounterStep(Math.min(1, (h.life + dt) / dt));
  const older = clamp((h.t - dt) / h.max, 0, 1);
  const band = SHOCKWAVE_HALF_WIDTH + PLAYER_HAZARD_RADIUS;
  const samples = Math.max(1, Math.ceil(dst(p0.x, p0.y, p1.x, p1.y) / (band * .5)));
  let previous = dst(p0.x, p0.y, h.x, h.y) - oldRadius;
  for(let i=1;i<=samples;i++){
    const t = i / samples;
    const k = lerp(older, growth, t);
    const radius = lerp(4, h.maxR, k * (2 - k));
    const delta = dst(lerp(p0.x, p1.x, t), lerp(p0.y, p1.y, t), h.x, h.y) - radius;
    if(Math.min(previous, delta) <= band && Math.max(previous, delta) >= -band){
      h.hit = true;
      hurtPlayer(h.dmg);
      break;
    }
    previous = delta;
  }
}

function drawEncounterLane(g, x0, y0, x1, y1, radius, col, warning, height){
  g.save();
  g.translate(SX(x0), SY(y0) - height);
  g.scale(1, KZ);
  g.lineCap = 'round';
  const path = () => { g.beginPath(); g.moveTo(0, 0); g.lineTo(x1 - x0, y1 - y0); g.stroke(); };
  g.strokeStyle = '#220918';
  g.lineWidth = radius * 2 + 4;
  g.globalAlpha = warning ? .69 : .56;
  path();
  g.strokeStyle = col;
  g.lineWidth = radius * 2;
  g.globalAlpha = warning ? .38 : .66;
  path();
  if(warning) g.setLineDash([9, 6]);
  g.strokeStyle = '#fff3dc';
  g.lineWidth = warning ? 2.7 : Math.max(2.5, radius * .30);
  g.globalAlpha = .96;
  path();
  g.restore();
}

function drawEncounterBeam(g, h, warning){
  drawEncounterLane(g, h.x, h.y,
    h.x + Math.cos(h.ang) * h.len, h.y + Math.sin(h.ang) * h.len,
    h.wide, h.col, warning, BULLET_H);
}

function drawHazardCircle(g, x, y, r, color, progress){
  const cx = SX(x), cy = SY(y);
  g.save();
  g.fillStyle = color;
  g.globalAlpha = .18 + .17 * clamp(progress, 0, 1);
  g.beginPath(); g.ellipse(cx, cy, r, r * KZ, 0, 0, TAU); g.fill();
  g.globalAlpha = .92;
  g.strokeStyle = '#260f19';
  g.lineWidth = 4.4;
  g.stroke();
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.stroke();
  const inner = r * lerp(.96, .18, clamp(progress, 0, 1));
  g.strokeStyle = '#fff5dc';
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.beginPath(); g.ellipse(cx, cy, inner, inner * KZ, 0, 0, TAU); g.stroke();
  g.restore();
}

function drawEncounterWave(g, h){
  g.save();
  g.translate(SX(h.x), SY(h.y));
  g.scale(1, KZ);
  g.strokeStyle = '#30121b';
  g.globalAlpha = .60;
  g.lineWidth = SHOCKWAVE_HALF_WIDTH * 2 + 3;
  g.beginPath(); g.arc(0, 0, h.r, 0, TAU); g.stroke();
  g.strokeStyle = h.col;
  g.globalAlpha = .68;
  g.lineWidth = SHOCKWAVE_HALF_WIDTH * 2;
  g.stroke();
  g.strokeStyle = '#fff3da';
  g.globalAlpha = .84;
  g.lineWidth = 2;
  g.stroke();
  g.restore();
}

function drawGuardDetails(g, b, x, y, fade=1){
  if(!GUARD_BOSSES[b.kind] || fade <= 0) return;
  g.save();
  g.globalAlpha = fade;
  g.translate(x, y);
  const p = b.ph > 0;
  if(b.kind === 'bulwark'){
    g.scale(b.face, 1);
    g.fillStyle = '#252821';
    g.strokeStyle = '#ffe288';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-20, -38); g.lineTo(5, -42); g.lineTo(28, -26); g.lineTo(18, -8); g.lineTo(-12, -12);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = p ? '#ff7952' : '#d5b850';
    for(let i=0;i<3;i++) g.fillRect(-10 + i * 8, -33 + i * 3, 4, 8);
  } else {
    g.lineWidth = 2;
    for(let i=0;i<3;i++){
      const phase = G.t * (p ? 1.8 : .92) + TAU * i / 3;
      const dx = Math.cos(phase) * 31, dy = Math.sin(phase) * 14 - 30;
      g.fillStyle = '#163746';
      g.strokeStyle = p ? '#b9fff1' : '#6ae3ce';
      g.beginPath();
      g.moveTo(dx, dy - 9); g.lineTo(dx + 6, dy); g.lineTo(dx, dy + 9); g.lineTo(dx - 6, dy);
      g.closePath(); g.fill(); g.stroke();
    }
  }
  g.restore();
}

const ELITE_VARIANTS = {
  ram:{ col:'#ffd068', range:170, wind:.69, cooldown:3.2 },
  lance:{ col:'#94ebed', range:275, wind:.85, cooldown:4.2 }
};

function markEliteVariant(e){
  if(!e.elite || e.boom) return;
  e.eliteVariant = e.shoot > 0 ? 'lance' : 'ram';
  e.eliteCooldown = e.shootT + .68;
}

function updateEliteVariant(e, dt, distance){
  const spec = ELITE_VARIANTS[e.eliteVariant];
  if(!spec) return false;
  let a = e.eliteAct;
  if(e.stun > 0){
    if(a){ e.eliteAct = null; e.eliteCooldown = 1.2; }
    return false;
  }
  e.eliteCooldown = Math.max(0, e.eliteCooldown - dt);
  if(!a){
    if(e.eliteCooldown > 0 || distance > spec.range || distance < e.r + 12) return false;
    const angle = Math.atan2(G.p.y - e.y, G.p.x - e.x);
    const ram = e.eliteVariant === 'ram';
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const reach = FieldMaps.dashDistance(e,dx,dy,ram ? 136 : 318,ram ? e.r : 5);
    if(reach < 50 || (!ram && reach < distance)) return false;
    const goal = ram ? chargeEndpoint(e.x,e.y,angle,reach) : {x:e.x+reach*dx,y:e.y+reach*dy};
    a = e.eliteAct = { x:e.x, y:e.y, goal:goal, angle:angle, reach:reach, t:0, hit:false };
    e.vx = e.vy = 0;
    return true;
  }
  a.t += dt;
  if(a.t < spec.wind) return true;
  if(e.eliteVariant === 'lance'){
    addBeam(e.x, e.y, a.angle, a.reach, 7, e.dmg, .25, 0, spec.col);
    e.shootT = Math.max(e.shootT, 1);
  } else {
    const f = clamp((a.t - spec.wind) / .34, 0, 1);
    const oldX = e.x, oldY = e.y;
    e.x = lerp(a.x, a.goal.x, f);
    e.y = lerp(a.y, a.goal.y, f);
    if(!a.hit && encounterDistanceSq(G.p.x, G.p.y, oldX, oldY, e.x, e.y) <= (e.r + PLAYER_HAZARD_RADIUS) ** 2){
      a.hit = true;
      hurtPlayer(e.dmg);
    }
    if(f < 1) return true;
  }
  e.eliteAct = null;
  e.eliteCooldown = spec.cooldown;
  return true;
}

function drawEncounterWarnings(g){
  for(const h of G.haz){
    if(h.kind === 'zone') drawHazardCircle(g, h.x, h.y, h.r, '#ff675e', h.t / h.max);
    else if(h.kind === 'pool' && h.t < h.arm) drawHazardCircle(g, h.x, h.y, h.r, '#ffc184', h.t / h.arm);
  }
  const boss = G.boss;
  if(boss && !boss.dead){
    if(boss.act?.draw) boss.act.draw(g);
    else if(boss.tele) drawHazardCircle(g, boss.x, boss.y, boss.r * 1.3, '#ffc685', .4);
  }
  for(const e of G.enemies){
    if(e.dead || !e.eliteVariant || e.spawnT > 0) continue;
    const a = e.eliteAct, spec = ELITE_VARIANTS[e.eliteVariant];
    if(a && a.t < spec.wind){
      const ram = e.eliteVariant === 'ram';
      drawEncounterLane(g, a.x, a.y, a.goal.x, a.goal.y, ram ? e.r : 7, spec.col, true, ram ? 0 : BULLET_H);
    }
    g.save();
    g.fillStyle = spec.col;
    g.strokeStyle = '#171a25';
    g.lineWidth = 2.1;
    const x = SX(e.x), y = SY(e.y) - e.h - 6;
    g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x, y - 5); g.lineTo(x + 4, y);
    if(e.eliteVariant === 'lance') g.lineTo(x, y + 5);
    g.closePath(); g.stroke(); g.fill();
    g.restore();
  }
}
