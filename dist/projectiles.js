'use strict';

/* Projectile coordinates and radii are in the arena plane. */
const PROJECTILE_CELL = 64;
const HOMING_STEP = 1 / 60;
const SUBMUNITION_LIFE = .86;
const PROJECTILE_EFFECTS = {
  burnSeconds:2.4, burnPerLevel:3.2, slowSeconds:1.3, slowPerLevel:.22, slowLimit:.78,
  blastBaseRadius:22, blastRadiusPerLevel:6, blastShare:.42
};

function projectileContact(x0, y0, x1, y1, radius){
  const c = x0 * x0 + y0 * y0 - radius * radius;
  if(c <= 0) return 0;
  const dx = x1 - x0, dy = y1 - y0;
  const a = dx * dx + dy * dy;
  const b = x0 * dx + y0 * dy;
  const disc = b * b - a * c;
  if(a === 0 || b >= 0 || disc < 0) return null;
  const t = c / (-b + Math.sqrt(disc));
  return t <= 1 ? t : null;
}

/* The altitude is measured in rendered pixels above the projectile's ground shadow. */
function lobProjectile(b, target){
  const speedSq = b.vx * b.vx + b.vy * b.vy;
  const targetTime = ((target.x - b.x) * b.vx + (target.y - b.y) * b.vy) / speedSq;
  const flight = clamp(targetTime, Math.min(.33, b.life), b.life);
  b.arc = flight;
  b.arcH = 28;
  b.landAt = b.life - flight;
}

function projectileAltitude(b, life = b.life){
  if(b.splitAltitude !== undefined) return lerp(b.splitAltitude,BULLET_H,clamp((SUBMUNITION_LIFE-life)/.2,0,1));
  if(!b.arc) return BULLET_H;
  const t = clamp(life - b.landAt, 0, b.arc) / b.arc;
  const progress = 1 - t;
  const landing = b.r * KZ;
  const apex = b.arcH + (BULLET_H - landing) * .5;
  return lerp(BULLET_H, landing, progress) + 4 * apex * progress * (1 - progress);
}

function aerialContact(b, e, entry, duration, x0, y0, x1, y1, r){
  const top = (e.h ?? e.r * 2) + b.r * KZ;
  if(projectileAltitude(b, b.life - duration * entry) <= top) return entry;

  const dx = x1 - x0, dy = y1 - y0;
  const a = dx * dx + dy * dy;
  const dot = x0 * dx + y0 * dy;
  const c = x0 * x0 + y0 * y0 - r * r;
  // Intersect only while the ground footprint still overlaps the moving target.
  const exit = a ? Math.min(1, (-dot + Math.sqrt(Math.max(0, dot * dot - a * c))) / a) : 1;
  if(projectileAltitude(b, b.life - duration * exit) > top) return null;

  // From a point above the target to a point below its top, the arc is descending.
  let low = entry, high = exit;
  for(let i = 0; i < 14; i++){
    const t = (low + high) * .5;
    if(projectileAltitude(b, b.life - duration * t) > top) low = t;
    else high = t;
  }
  return high;
}

function projectileTargets(){
  return G.boss ? [...G.enemies, G.boss] : G.enemies;
}

function projectileTargetActive(e){
  return !e.dead && !(e.spawnT > 0) && (e === G.boss || G.enemies.length > 0);
}

function snapshotProjectileMotion(){
  const old = new Map();
  for(const e of projectileTargets()){
    if(projectileTargetActive(e)) old.set(e, { x:e.x, y:e.y });
  }
  return old;
}

class ProjectileField {
  constructor(previous, dt){
    this.columns = 2 + Math.ceil(ARENA.w / PROJECTILE_CELL);
    this.rows = 2 + Math.ceil(ARENA.h / PROJECTILE_CELL);
    this.cells = new Map();
    this.visit = 0;
    for(const e of projectileTargets()){
      if(!projectileTargetActive(e)) continue;
      let from = previous?.get(e) || e;
      // Boss teleports must not create a hittable path across the arena.
      if(e === G.boss && e.teleportedAt === G.t) from = e;
      const entry = { e:e, x:from.x, y:from.y, dx:e.x - from.x, dy:e.y - from.y, visit:0 };
      this.eachCell(from.x, from.y, e.x, e.y, e.r, key => {
        let cell = this.cells.get(key);
        if(!cell) this.cells.set(key, cell = []);
        cell.push(entry);
      });
    }
  }

  eachCell(x0, y0, x1, y1, pad, visit){
    const left = Math.max(-1, Math.floor((Math.min(x0, x1) - pad) / PROJECTILE_CELL));
    const right = Math.min(this.columns - 2, Math.floor((Math.max(x0, x1) + pad) / PROJECTILE_CELL));
    const top = Math.max(-1, Math.floor((Math.min(y0, y1) - pad) / PROJECTILE_CELL));
    const bottom = Math.min(this.rows - 2, Math.floor((Math.max(y0, y1) + pad) / PROJECTILE_CELL));
    for(let y = top; y <= bottom; y++){
      for(let x = left; x <= right; x++) visit(x + y * this.columns);
    }
  }

  query(x0, y0, x1, y1, pad, visit){
    const queryId = ++this.visit;
    this.eachCell(x0, y0, x1, y1, pad, key => {
      const cell = this.cells.get(key);
      if(!cell) return;
      for(const p of cell){
        if(p.visit === queryId || !projectileTargetActive(p.e)) continue;
        p.visit = queryId;
        visit(p);
      }
    });
  }

  nearest(x, y, range, time, accept){
    let nearest = null;
    let best = range * range;
    this.query(x, y, x, y, range, p => {
      if(accept && !accept(p.e)) return;
      const px = p.x + p.dx * time, py = p.y + p.dy * time;
      const distance = d2(x, y, px, py);
      if(distance < best){
        best = distance;
        nearest = { e:p.e, x:px, y:py };
      }
    });
    return nearest;
  }
}

function projectileDuration(b, step){
  if(b.x < 0 || b.x > ARENA.w || b.y < 0 || b.y > ARENA.h) return 0;
  const xExit = b.vx > 0 ? (ARENA.w - b.x) / b.vx : b.vx < 0 ? -b.x / b.vx : Infinity;
  const yExit = b.vy > 0 ? (ARENA.h - b.y) / b.vy : b.vy < 0 ? -b.y / b.vy : Infinity;
  const remaining = b.arc ? b.life - b.landAt : b.life;
  return Math.min(step, Math.max(0, remaining), xExit, yExit);
}

function sweepProjectile(field, b, x0, y0, x1, y1, start, end, contacts, duration=0){
  contacts.length = 0;
  field.query(x0, y0, x1, y1, b.r, p => {
    if(p.e===b.splitOrigin || b.hits.includes(p.e) || (p.e === G.boss && b.bossHit)) return;
    const dx0 = x0 - p.x - p.dx * start, dy0 = y0 - p.y - p.dy * start;
    const dx1 = x1 - p.x - p.dx * end, dy1 = y1 - p.y - p.dy * end;
    const radius = b.r + p.e.r;
    let t = projectileContact(dx0, dy0, dx1, dy1, radius);
    if(t !== null && (b.arc || b.splitAltitude!==undefined)) t = aerialContact(b, p.e, t, duration, dx0, dy0, dx1, dy1, radius);
    if(t !== null) contacts.push({ e:p.e, t:t });
  });
  if(contacts.length > 1) contacts.sort((a, b) => a.t - b.t);
  for(const contact of contacts){
    const e = contact.e;
    if(!projectileTargetActive(e) || (e === G.boss && b.bossHit)) continue;
    b.x = lerp(x0, x1, contact.t);
    b.y = lerp(y0, y1, contact.t);
    b.hits.push(e);
    const altitude = b.arc || b.splitAltitude!==undefined ? projectileAltitude(b, b.life - duration * contact.t) : undefined;
    onBulletHit(b, e, field, lerp(start, end, contact.t), altitude);
    if(b.pierce <= 0) return false;
    b.pierce--;
  }
  b.x = x1;
  b.y = y1;
  return true;
}

function advancePlayerProjectile(b, dt, field, contacts){
  if(b.fromX !== undefined){
    const alive = sweepProjectile(field, b, b.fromX, b.fromY, b.x, b.y, 0, 0, contacts);
    delete b.fromX;
    delete b.fromY;
    if(!alive) return false;
  }
  let elapsed = 0;
  do {
    const step = b.homing ? Math.min(dt - elapsed, HOMING_STEP) : dt;
    const start = dt ? elapsed / dt : 0;
    if(b.homing){
      const target = field.nearest(b.x, b.y, 300, start,
        b.seekTarget ? unit => unit===b.seekTarget : undefined);
      if(target){
        const current = Math.atan2(b.vy, b.vx);
        const aim = Math.atan2(target.y - b.y, target.x - b.x);
        const angle = angLerp(current, aim, 1 - Math.exp(-(b.turn || 3.4) * step));
        const speed = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
      }
    }
    const travel = projectileDuration(b, step);
    elapsed += travel;
    const end = dt ? elapsed / dt : 0;
    if(!sweepProjectile(field, b, b.x, b.y, b.x + b.vx * travel, b.y + b.vy * travel,
      start, end, contacts, travel)) return false;
    b.life -= travel;
    if(travel < step || b.life <= (b.landAt ?? 0)){
      if(b.fuse) projectileExplosion(b, field, end, null, b.arc ? projectileAltitude(b) : undefined);
      return false;
    }
  } while(elapsed < dt);

  if((b.w === 'flamer' || b.w === 'toxin') && Math.random() < dt * 26){
    G.parts.push({ x:b.x, y:b.y - 4, vx:rnd(-16, 16), vy:-rnd(4, 28),
      life:.24, max:.24, col:b.w === 'toxin' ? '#a8e05a' : '#ff8a3c', r:rnd(1.4, 2.6) });
  }
  // Supply crates use proximity to open. Keep the sparks as bullets pass through.
  for(const c of G.crates){
    if(!c.dead && c.fall <= 0 && d2(b.x, b.y, c.x, c.y) < 17 * 17){
      spark(b.x, b.y, 2, '#ffd08a', 40);
      break;
    }
  }
  return true;
}

function updatePlayerProjectiles(dt, previous){
  const bullets = G.bullets;
  if(!bullets.length) return;
  const field = new ProjectileField(previous, dt);
  const contacts = [];
  for(let i = bullets.length - 1; i >= 0; i--){
    if(!advancePlayerProjectile(bullets[i], dt, field, contacts)) bullets[i] = null;
  }
  let kept = 0;
  for(const bullet of bullets){
    if(bullet) bullets[kept++] = bullet;
  }
  bullets.length = kept;
}

function hitProjectileTarget(b, e, damage, crit, x, y, opt){
  if(e === G.boss){
    if(b.bossHit) return;
    b.bossHit = true;
    damageBoss(e, damage, crit, x, y, opt);
  } else {
    applyDamage(e, damage, crit, x, y, opt);
  }
}

function projectileSplash(b, field, time, radius, damage, skip){
  const targets = [];
  field.query(b.x, b.y, b.x, b.y, radius, p => {
    if(p.e !== skip && d2(b.x, b.y, p.x + p.dx * time, p.y + p.dy * time) <= (radius + p.e.r) ** 2){
      targets.push(p.e);
    }
  });
  for(const e of targets){
    if(projectileTargetActive(e)) hitProjectileTarget(b, e, damage, false, e.x, e.y);
  }
}

function projectileExplosion(b, field, time, skip, altitude){
  const landing = b.arc && !skip;
  const radius = (landing || b.w === 'micromissile' ? 46 : 38) * G.st.boomMul;
  projectileSplash(b, field, time, radius, b.dmg * (landing ? .8 : .72), skip);
  explodeFX(b.x, b.y, radius, altitude);
  if(skip && b.arc) addFlash(b.x, b.y, radius * 2.2, '#ff8a5c', .5);
  if(!skip) addBurn(b.x, b.y, 26);
}

function splitMissile(parent, hit, field, time, altitude){
  const damage=parent.splitDamage;
  parent.splitDamage=0;
  let first=null;
  for(let index=0;index<2;index++){
    const target=field.nearest(parent.x,parent.y,210,time,unit=>unit!==hit && unit!==first);
    if(!target) break;
    first=target.e;
    const angle=Math.atan2(target.y-parent.y,target.x-parent.x)+(index===0?-.27:.27);
    G.bullets.push({
      x:parent.x,y:parent.y,vx:Math.cos(angle)*385,vy:Math.sin(angle)*385,
      dmg:damage,pierce:0,hits:[],r:2.35,life:SUBMUNITION_LIFE,crit:false,
      w:'micromissile',barrage:true,homing:true,turn:9,seekTarget:target.e,splitOrigin:hit,
      splitAltitude:altitude ?? BULLET_H
    });
  }
}

function projectileChain(b, e, field, time){
  const isArc = b.w === 'arc' && !b.barrage;
  const jumps = G.st.chain + (isArc ? 2 : 0);
  let x = b.x, y = b.y;
  const visited = new Set(b.hits);
  for(let k = 0; k < jumps; k++){
    const target = field.nearest(x, y, 130, time, next => !visited.has(next) && (next !== G.boss || !b.bossHit));
    if(!target) break;
    hitProjectileTarget(b, target.e, b.dmg * .55, false, target.x, target.y);
    visited.add(target.e);
    G.parts.push({ x:x, y:y, vx:0, vy:0, life:.16, max:.16, col:'#b9f2ff', r:1,
      line:{ x2:target.x, y2:target.y, width:isArc ? 2.5 : 2, electric:isArc } });
    x = target.x;
    y = target.y;
  }
}

function onBulletHit(b, e, field, time, altitude){
  const s = G.st;
  hitFX(b.x, altitude === undefined ? b.y - 4 : b.y, Math.atan2(b.vy, b.vx),
    b.boom ? '#ffb060' : '#ffe6c0', !!b.boom, altitude);
  hitProjectileTarget(b, e, b.dmg, b.crit, b.x, b.y, { pct:b.pct || 0, pierceIndex:b.hits.length - 1 });

  const xu = s.elemMul > 1 && Math.random() < (s.elemMul - 1) ? s.elemMul : 1;
  if(b.boom) projectileExplosion(b, field, time, e, altitude);
  if(b.splitDamage) splitMissile(b, e, field, time, altitude);
  if(b.w === 'flamer'){ setBurn(e, 2.6, 6 * xu); }
  else if(b.w === 'acid'){ setBurn(e, 3.0, 5 * xu); projectileSplash(b, field, time, 26, b.dmg * .38, e); }
  else if(b.w === 'frost'){
    e.slowT = Math.max(e.slowT || 0, 1.6 * xu);
    e.slowAmt = Math.max(e.slowAmt || 0, .45 * xu);
  } else if(b.w === 'plasma'){
    const radius = 56 * s.boomMul;
    projectileSplash(b, field, time, radius, b.dmg * .55, e);
    G.rings.push({ x:b.x, y:b.y, r:6, max:radius, life:.26, maxLife:.26, col:'#c08cff', w:2 });
  }
  const effects = PROJECTILE_EFFECTS;
  if(s.burn > 0) setBurn(e,effects.burnSeconds,effects.burnPerLevel * s.burn * xu);
  if(s.freeze > 0){
    e.slowT = effects.slowSeconds;
    e.slowAmt = Math.min(effects.slowLimit,effects.slowPerLevel * s.freeze * xu);
  }
  if(s.blast > 0){
    const radius = (effects.blastBaseRadius + effects.blastRadiusPerLevel * s.blast) * s.boomMul;
    projectileSplash(b,field,time,radius,b.dmg * effects.blastShare,e);
    G.rings.push({ x:b.x, y:b.y, r:4, max:radius, life:.24, maxLife:.24, col:'#ffc46a', w:2 });
  }
  if(s.chain > 0 || (b.w === 'arc' && !b.barrage)) projectileChain(b, e, field, time);
}
