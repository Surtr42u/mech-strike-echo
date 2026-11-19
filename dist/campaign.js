'use strict';

function campaignWaveIndex(stage = G.stage, wave = G.wave){
  return stage * WAVES_PER_STAGE + wave;
}

const CampaignBalance = (() => {
  // wave, seconds, hp growth, damage, xp, spawn interval, paired chance, active cap, elite chance
  const knots = [
    [1, 11, 0, 1, 2, 1.28, .10, 18, .04],
    [14, 12, 8, 1.23, 2.5, 1.10, .18, 22, .08],
    [28, 12.5, 19, 1.48, 3, 1.02, .28, 26, .10],
    [42, 13, 32, 1.72, 3.5, .93, .37, 30, .13],
    [56, 13.5, 46, 1.98, 4, .85, .46, 35, .16],
    [70, 14, 62, 2.2, 4.5, .77, .54, 40, .18]
  ];
  const table = [];
  for(let i=1;i<=70;i++){
    const right = knots.findIndex(k => k[0] >= i);
    const b = knots[right], a = knots[Math.max(0, right - 1)];
    const t = a === b ? 0 : (i - a[0]) / (b[0] - a[0]);
    const at = n => a[n] + (b[n] - a[n]) * t;
    table[i] = Object.freeze({
      duration:at(1), hpGrowth:at(2), damageMul:at(3), xpValue:at(4),
      interval:at(5), extraChance:at(6), cap:Math.round(at(7)), eliteChance:at(8)
    });
  }
  return { at:(stage=G.stage, wave=G.wave) => table[campaignWaveIndex(stage, wave)] };
})();

const CampaignEnemies = (() => {
  // Each row is [role, minimum sector wave, weight]. The tunnels use a different roster from the surface.
  const surface = [
    [['runner',1,5],['gunner',1,3],['tank',3,2],['drone',4,2],['shieldguard',5,2]],
    [['drone',1,5],['gunner',1,2],['sniper',2,3],['bomber',4,2],['shieldguard',4,2]],
    [['tank',1,3],['caster',1,4],['runner',1,3],['bomber',3,2],['conjurer',4,2]],
    [['bomber',1,5],['brute',1,3],['drone',1,2],['gunner',4,2],['shieldguard',5,2]],
    [['caster',1,3],['sniper',1,3],['brute',1,2],['conjurer',2,3],['shieldguard',4,2],['drone',6,2]]
  ];
  const tunnel = [['bomber',1,3],['caster',1,3],['sniper',1,3],['conjurer',4,3],['brute',7,2]];
  const tunnelSkins = { bomber:'assassin', caster:'eyedemon', sniper:'voidshard', runner:'voidshard', conjurer:'eyedemon', brute:'golem' };
  const supports = ['golem','hackdrone','golem','fireelem','eyedemon'];
  const chanters = ['scav','assassin','snowbeast','fireelem','eyedemon'];

  function kind(stage, wave, floor, sample){
    const entries = floor === 'underground' ? tunnel : surface[stage];
    const eligible = entries.filter(entry => wave >= entry[1]);
    let roll = sample * eligible.reduce((sum, entry) => sum + entry[2], 0);
    for(const entry of eligible){
      roll -= entry[2];
      if(roll < 0) return entry[0];
    }
    return eligible.at(-1)[0];
  }

  function sprite(enemy){
    if(FieldMaps.underground() && tunnelSkins[enemy.kind]) return tunnelSkins[enemy.kind];
    if(enemy.kind === 'shieldguard') return supports[G.stage];
    if(enemy.kind === 'conjurer') return chanters[G.stage];
    return MON_THEME[G.stage][enemy.kind] || 'scav';
  }

  return { kind, sprite };
})();

const EnemyTactics = (() => {
  function detach(e){
    if(e.ward && e.ward.shieldSource === e) e.ward.shieldSource = null;
    if(e.shieldSource && e.shieldSource.ward === e) e.shieldSource.ward = null;
    e.ward = e.shieldSource = null;
    e.cast = null;
  }

  function supported(e){
    const support = e.shieldSource;
    return support && !support.dead && support.stun <= 0 && support.ward === e &&
      d2(e.x,e.y,support.x,support.y) <= 130 ** 2;
  }

  function interrupt(e){
    if(e.cast){
      e.cast = null;
      e.tacticsCd = Math.max(e.tacticsCd, 2.2);
      spark(e.x,e.y,4,'#f6bfff',58);
    }
  }

  function guardMotion(e, dt){
    if(e.stun > 0){ detach(e); return {stop:true}; }
    e.tacticsCd -= dt;
    const old = e.ward;
    if(old?.dead || (old && d2(e.x,e.y,old.x,old.y) > 145 ** 2)) detach(e);
    if(e.tacticsCd <= 0){
      e.tacticsCd = .42;
      let best = null, bd = 148 ** 2;
      for(const ally of G.enemies){
        if(ally === e || ally.dead || ally.spawnT > 0 || ally.kind === 'shieldguard' ||
          (ally.shieldSource && ally.shieldSource !== e)) continue;
        const dd = d2(e.x,e.y,ally.x,ally.y);
        if(dd < bd && FieldMaps.lineOpen(e.x,e.y,ally.x,ally.y)){
          best = ally;
          bd = dd;
        }
      }
      if(best !== e.ward) detach(e);
      if(best){
        e.ward = best;
        best.shieldSource = e;
      }
    }
    if(e.ward) return {x:e.ward.x,y:e.ward.y,keep:48};
    return null;
  }

  function summonMotion(e, dt, distance){
    if(e.stun > 0){ interrupt(e); return {stop:true}; }
    e.tacticsCd -= dt;
    if(e.cast){
      e.cast.left -= dt;
      if(e.cast.left <= 0){
        const point = e.cast;
        e.cast = null;
        e.tacticsCd = 4.25;
        if(G.enemies.length < CampaignBalance.at().cap){
          spawnEnemy('runner',point.x,point.y,{noElite:true,noReward:true,waveOrigin:e.waveOrigin}).summoner = e;
        }
      }
      return {stop:true};
    }
    if(e.tacticsCd <= 0 && distance <= 260 && distance >= 62 &&
      FieldMaps.lineOpen(e.x,e.y,G.p.x,G.p.y) && G.enemies.length < CampaignBalance.at().cap &&
      !G.enemies.some(ally => ally.summoner === e && !ally.dead)){
      const direction = Math.atan2(G.p.y-e.y,G.p.x-e.x);
      const x = clamp(e.x + Math.cos(direction) * 46,45,ARENA.w-45);
      const y = clamp(e.y + Math.sin(direction) * 46,45,ARENA.h-45);
      if(!FieldMaps.blocksMovement(x,y,12)) e.cast = {x,y,left:1.12};
    }
    return e.cast ? {stop:true} : {x:G.p.x,y:G.p.y,keep:156};
  }

  function motion(e, dt, distance){
    if(e.kind === 'shieldguard') return guardMotion(e,dt);
    if(e.kind === 'conjurer') return summonMotion(e,dt,distance);
    return null;
  }

  function draw(g){
    for(const e of G.enemies){
      if(e.dead || e.spawnT > 0) continue;
      if(e.kind === 'shieldguard' || e.kind === 'conjurer'){
        const x=SX(e.x), y=SY(e.y)-e.h;
        g.save();
        g.strokeStyle='#142028'; g.lineWidth=2.5;
        g.fillStyle=e.kind === 'shieldguard'?'#85edd7':'#edb0ff';
        g.beginPath();
        if(e.kind === 'shieldguard'){
          g.moveTo(x-5,y-6);g.lineTo(x+5,y-6);g.lineTo(x+4,y);g.lineTo(x,y+3);g.lineTo(x-4,y);
        } else {
          g.moveTo(x,y-8);g.lineTo(x+5,y-3);g.lineTo(x,y+2);g.lineTo(x-5,y-3);
        }
        g.closePath();g.stroke();g.fill();g.restore();
      }
      if(e.ward && supported(e.ward)){
        const ally=e.ward, x=SX(ally.x),y=SY(ally.y);
        g.save();
        g.strokeStyle='#91e9d4';
        g.globalAlpha=.58;g.lineWidth=1.35;g.setLineDash([3,2]);
        g.beginPath();g.moveTo(SX(e.x),SY(e.y)-14);g.lineTo(x,y-14);g.stroke();
        g.setLineDash([]);g.globalAlpha=.92;g.lineWidth=1.8;
        g.beginPath();g.ellipse(x,y-9,ally.r+3,5,0,0,TAU);g.stroke();g.restore();
      }
      if(e.cast) drawHazardCircle(g,e.cast.x,e.cast.y,23,'#e9a4ff',1-e.cast.left/1.12);
    }
  }

  return { detach, supported, interrupt, motion, draw };
})();
