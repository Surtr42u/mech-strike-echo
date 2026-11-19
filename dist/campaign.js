'use strict';

function campaignWaveIndex(stage = G.stage, wave = G.wave){
  return stage * WAVES_PER_STAGE + wave;
}

const CampaignBalance = (() => {
  // wave, seconds, hp growth, damage, xp, spawn interval, paired chance, active cap, elite chance
  const knots = [
    [1, 11, 0, 1, 2, 1.28, .10, 18, .04],
    [14, 12, 7, 1.23, 2.5, 1.10, .18, 22, .08],
    [28, 12.5, 15, 1.48, 3, 1.02, .28, 26, .10],
    [42, 13, 25, 1.72, 3.5, .93, .37, 30, .13],
    [56, 13.5, 38, 1.98, 4, .85, .46, 35, .16],
    [70, 14, 54, 2.2, 4.5, .77, .54, 40, .18]
  ];
  const table = [];
  for(let i=1;i<=70;i++){
    const right = knots.findIndex(k => k[0] >= i);
    const b = knots[right], a = knots[Math.max(0, right - 1)];
    const t = a === b ? 0 : (i - a[0]) / (b[0] - a[0]);
    const at = n => a[n] + (b[n] - a[n]) * t;
    const hpGrowth=at(2);
    const lightHpGrowth=hpGrowth+Math.max(0,hpGrowth-15)*.33;
    table[i] = Object.freeze({
      duration:at(1), hpGrowth, lightHpGrowth, damageMul:at(3), xpValue:at(4),
      interval:at(5), extraChance:at(6), cap:Math.round(at(7)), eliteChance:at(8)
    });
  }
  return { at:(stage=G.stage, wave=G.wave) => table[campaignWaveIndex(stage, wave)] };
})();

const CampaignEnemies = (() => {
  // Each row is [role, minimum sector wave, weight]. The tunnels use a different roster from the surface.
  const surface = [
    [['runner',1,5],['gunner',1,3],['tank',3,2]],
    [['drone',1,4],['gunner',1,3],['runner',1,3],['tank',2,2],['lancer',3,3],['shieldguard',4,2]],
    [['runner',1,4],['tank',1,3],['shieldguard',2,2],['lancer',2,2],['bastion',4,2],['conjurer',7,2]],
    [['bomber',1,4],['gunner',1,3],['runner',1,2],['lancer',1,2],['shieldguard',2,3],['bastion',1,2],['conjurer',5,1]],
    [['drone',1,4],['runner',1,3],['sniper',1,3],['lancer',1,2],['shieldguard',4,2],['bastion',2,2],['conjurer',1,3]]
  ];
  const tunnel = [['burrower',1,6],['shellback',3,3]];
  const tunnelSkins = {burrower:'voidshard',shellback:'golem'};
  const iceMine = [['bomber',1,5],['shellback',1,4],['sniper',3,2]];
  const mineSkins = {bomber:'slime',shellback:'golem',sniper:'hackdrone'};
  const supports = ['golem','hackdrone','golem','fireelem','eyedemon'];
  const chanters = ['scav','assassin','snowbeast','fireelem','eyedemon'];
  const lancers = ['scav','assassin','snowbeast','fireelem','voidshard'];
  const heavies = ['golem','golem','golem','fireelem','eyedemon'];
  const ranks = {lancer:2,shieldguard:2,sniper:2,bastion:3,conjurer:3};
  const rank = kind => ranks[kind] || 1;
  const light = new Set(['runner','gunner','drone','bomber','burrower']);
  const healthGrowth = (kind,profile) => light.has(kind) ? profile.lightHpGrowth : profile.hpGrowth;

  function kind(stage, wave, floor, sample, maxRank=3){
    const entries = floor === 'ice-mine' ? iceMine : floor === 'underground' ? tunnel : surface[stage];
    const eligible = entries.filter(entry => wave >= entry[1] && rank(entry[0]) <= maxRank);
    let roll = sample * eligible.reduce((sum, entry) => sum + entry[2], 0);
    for(const entry of eligible){
      roll -= entry[2];
      if(roll < 0) return entry[0];
    }
    return eligible.at(-1)[0];
  }

  function sprite(enemy){
    if(FieldMaps.floorId()==='ice-mine' && mineSkins[enemy.kind]) return mineSkins[enemy.kind];
    if(FieldMaps.underground() && tunnelSkins[enemy.kind]) return tunnelSkins[enemy.kind];
    if(enemy.kind === 'shieldguard') return supports[G.stage];
    if(enemy.kind === 'conjurer') return chanters[G.stage];
    if(enemy.kind === 'lancer') return lancers[G.stage];
    if(enemy.kind === 'bastion') return heavies[G.stage];
    return MON_THEME[G.stage][enemy.kind] || 'scav';
  }

  return { kind, rank, healthGrowth, sprite };
})();

const ThreatPacing = (() => {
  const patterns = [
    'ssppgrpprcpccc',
    'sspprporcprpcc',
    'sppcgrpcrpcpcc',
    'sppcrpporcprcc',
    'spcprppcorcpcc'
  ];
  const entries = {
    s:{label:'侦察',interval:1.20,cap:-3}, p:{label:'受压',interval:1,cap:0},
    r:{label:'休整',interval:1.82,cap:-7,delay:3.6},
    c:{label:'波峰',interval:.83,cap:2},
    g:{label:'守卫前哨',interval:.96,cap:0},
    o:{label:'指挥精英',interval:1.14,cap:-2}
  };
  const commanders = {
    1:{wave:7,kind:'lancer',name:'信号指挥兵',hint:'锁线会分叉 · 趁蓄力横移',col:'#ffb18b'},
    3:{wave:8,kind:'bastion',name:'炉线指挥兵',hint:'打碎外甲，再避开近身震击',col:'#ffd197'},
    4:{wave:9,kind:'conjurer',name:'裂隙指挥兵',hint:'击中施法者，打断援军和裂隙',col:'#f0b9ff'}
  };
  const rosterNotes = [
    '基础小怪与耐打小怪。地下是裂泥虫和壳卫。',
    '锁线枪手逼迫横移，护盾支援兵保护附近同伴。',
    '地表重装外甲可破。冻晶矿井有自爆虫、壳卫和坑道狙击手。',
    '护盾支援兵会修复同伴，重装震击需要拉开距离。',
    '远程压迫与重装混编，优先打断召唤。'
  ];
  const escorts = [
    null,null,['runner','shieldguard','conjurer'],['bomber','shieldguard','bastion'],['drone','lancer','conjurer']
  ];
  let current=null;

  function at(stage=G.stage,wave=G.wave){
    const code=patterns[stage][wave-1];
    return entries[code];
  }

  function enemyCap(){
    return Math.min(ENEMY_CAP,CampaignBalance.at().cap+at().cap);
  }

  function routeNote(stage){
    const c=commanders[stage];
    return rosterNotes[stage] + (c?' 第'+c.wave+'波 · '+c.name+'，随后休整。':'');
  }

  function beginWave(){
    if(current?.stage===G.stage && current.wave===G.wave) return;
    const spec=commanders[G.stage];
    current={stage:G.stage,wave:G.wave,spawned:0,body:null,down:false,spec:spec?.wave===G.wave ? spec : null};
  }

  function reset(){ current=null; }

  function nextKind(sample){
    beginWave();
    const intro=current.spawned++===0 && !FieldMaps.underground() &&
      (G.stage===1 && G.wave===3 ? 'lancer' : G.stage===2 && G.wave===4 ? 'bastion' : null);
    if(intro) return intro;
    const heavies=G.enemies.filter(e=>!e.dead && CampaignEnemies.rank(e.kind)===3).length;
    const maxRank=at().delay?1:heavies>=(G.stage>=4?3:2)?2:3;
    return CampaignEnemies.kind(G.stage,G.wave,FieldMaps.floorId(),sample,maxRank);
  }

  function update(){
    beginWave();
    if(!current.spec || current.body || current.down || G.waveDur-G.waveT<3.4) return;
    const c=current.spec;
    if(G.enemies.length>=ENEMY_CAP && !cullOldestEnemy()) return;
    const origin=FieldMaps.safePoint(G.p.x+Math.cos(G.p.faceAngle)*177,G.p.y+Math.sin(G.p.faceAngle)*177,28);
    current.body=spawnEnemy(c.kind,origin.x,origin.y,{elite:true,hpMul:.92,commander:c});
    current.body.spawnT=.82;
    banner(c.name,c.hint,1.5);
    SFX.boss();
  }

  function onEnemyDown(e){
    if(current?.body!==e || current.down) return;
    current.down=true;
    if(G.phase==='wave') G.waveT=Math.min(Math.max(0,G.waveT),2.8);
    banner(e.commander.name+' 已击破','下一波休整',1.2);
  }

  function canFinish(){
    beginWave();
    return !current.spec || current.down;
  }

  function commander(){
    return G.phase==='wave' && current?.stage===G.stage && current.wave===G.wave ? current : null;
  }

  function addBossEscort(b){
    const pack=escorts[G.stage];
    if(!pack || b.kind!==SCENES[G.stage].boss || G.bossEncounter?.resumeWave) return;
    for(let i=0;i<pack.length && G.enemies.length<ENEMY_CAP;i++){
      const a=(i*.65+1.1)*Math.PI;
      const pt=FieldMaps.safePoint(b.x+Math.cos(a)*91,b.y+Math.sin(a)*91,26);
      const e=spawnEnemy(pack[i],pt.x,pt.y,{noElite:true,hpMul:.70});
      e.summoner=b;
    }
  }

  return { at, enemyCap, routeNote, beginWave, reset, nextKind, update, onEnemyDown, canFinish, commander, addBossEscort };
})();

const EnemyTactics = (() => {
  function detach(e){
    if(e.ward && e.ward.shieldSource === e) e.ward.shieldSource = null;
    if(e.shieldSource && e.shieldSource.ward === e) e.shieldSource.ward = null;
    e.ward = e.shieldSource = null;
    e.cast = e.press = e.repair = null;
  }

  function supported(e){
    const support = e.shieldSource;
    return support && !support.dead && support.stun <= 0 && support.ward === e &&
      d2(e.x,e.y,support.x,support.y) <= 130 ** 2;
  }

  function interrupt(e){
    if(e.repair){
      e.repair=null;
      e.repairCd=3.2;
    }
    if(e.cast){
      e.cast = null;
      e.tacticsCd = Math.max(e.tacticsCd, 2.2);
      spark(e.x,e.y,4,'#f6bfff',58);
    }
  }

  function absorb(e,damage){
    if(!(e.plate>0)) return damage;
    const blocked=Math.min(e.plate,damage);
    e.plate-=blocked;
    if(e.plate<=0){
      e.stun=Math.max(e.stun || 0,1.30);
      e.press=null;
      e.tacticsCd=Math.max(e.tacticsCd,1.8);
      floatText(e.x,e.y,'外甲破裂','#ffe09b',true);
      spark(e.x,e.y,7,'#ffe09b',80);
    }
    return damage-blocked;
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
    if(e.ward && G.stage>=2 && d2(e.x,e.y,e.ward.x,e.ward.y)<108**2){
      const ally=e.ward;
      e.repairCd=(e.repairCd || 0)-dt;
      if(e.repair){
        e.repair.left-=dt;
        if(e.repair.left<=0){
          if(e.repair.target===ally && !ally.dead){
            ally.hp=Math.min(ally.maxHp,ally.hp+Math.min(45,ally.maxHp*.17));
            ally.repaired=true;
            spark(ally.x,ally.y,5,'#aef5a8',72);
          }
          e.repair=null;
          e.repairCd=5.5;
        }
      } else if(e.repairCd<=0 && !ally.repaired && ally.hp<=ally.maxHp*.66){
        e.repair={target:ally,left:1};
      }
      if(e.repair) return {stop:true};
    } else if(e.repair) interrupt(e);
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
        if(G.enemies.length < ThreatPacing.enemyCap()){
          spawnEnemy('runner',point.x,point.y,{noElite:true,noReward:true,waveOrigin:e.waveOrigin}).summoner = e;
          if(e.commander) addZone(point.x,point.y,44,e.dmg,.88);
        }
      }
      return {stop:true};
    }
    if(e.tacticsCd <= 0 && distance <= 260 && distance >= 62 &&
      FieldMaps.lineOpen(e.x,e.y,G.p.x,G.p.y) && G.enemies.length < ThreatPacing.enemyCap() &&
      !G.enemies.some(ally => ally.summoner === e && !ally.dead)){
      const direction = Math.atan2(G.p.y-e.y,G.p.x-e.x);
      const x = clamp(e.x + Math.cos(direction) * 46,45,ARENA.w-45);
      const y = clamp(e.y + Math.sin(direction) * 46,45,ARENA.h-45);
      if(!FieldMaps.blocksMovement(x,y,12)) e.cast = {x,y,left:1.12};
    }
    return e.cast ? {stop:true} : {x:G.p.x,y:G.p.y,keep:156};
  }

  function pressureMotion(e,dt,distance){
    const heavy=e.kind==='bastion';
    if(e.stun>0){ e.press=null; return {stop:true}; }
    e.tacticsCd-=dt;
    const a=e.press;
    if(a){
      a.left-=dt;
      if(a.left<=0){
        e.press=null;
        e.tacticsCd=e.commander?2.0:3.2;
        if(heavy){
          if(a.wave) addWave(a.x,a.y,a.radius,e.dmg,'#ffad69');
          else resolveGroundBlast(a.x,a.y,a.radius,e.dmg);
        } else {
          for(const ray of a.rays) addBeam(a.x,a.y,ray.angle,ray.reach,a.width,e.dmg,.36,0,'#ffa184');
          SFX.heavy();
        }
      }
      return {stop:true};
    }
    if(e.tacticsCd<=0 && (heavy ? distance<105 : distance>70 && distance<295)){
      const x=e.x,y=e.y;
      const angle=Math.atan2(G.p.y-y,G.p.x-x);
      const wind=heavy?1.04:.87;
      if(heavy){
        const wave=!!e.commander && e.plate<=0;
        e.press={x,y,wind,left:wind,radius:wave?144:e.commander?104:82,wave};
      } else if(FieldMaps.lineOpen(x,y,G.p.x,G.p.y)){
        const shots=e.commander&&e.hp<e.maxHp*.55?[-.22,0,.22]:[0];
        const rays=shots.map(off=>{
          const line=angle+off;
          const reach=FieldMaps.dashDistance(e,Math.cos(line),Math.sin(line),330,6);
          return {angle:line,reach};
        });
        e.press={x,y,wind,left:wind,rays,width:e.commander?12:8};
      }
    }
    if(e.press) return {stop:true};
    return heavy?null:{x:G.p.x,y:G.p.y,keep:162};
  }

  function motion(e, dt, distance){
    if(e.kind === 'shieldguard') return guardMotion(e,dt);
    if(e.kind === 'conjurer') return summonMotion(e,dt,distance);
    if(e.kind==='lancer' || e.kind==='bastion') return pressureMotion(e,dt,distance);
    return null;
  }

  function draw(g){
    for(const e of G.enemies){
      if(e.dead || e.spawnT > 0) continue;
      if(e.press){
        const a=e.press;
        if(a.rays){
          for(const ray of a.rays) drawEncounterLane(g,a.x,a.y,a.x+Math.cos(ray.angle)*ray.reach,
            a.y+Math.sin(ray.angle)*ray.reach,a.width,'#ff9b77',true,BULLET_H);
        } else drawHazardCircle(g,a.x,a.y,a.radius,'#ffc377',1-a.left/a.wind);
      }
      if(e.kind==='bastion' && e.plate>0){
        const x=SX(e.x), y=SY(e.y)-e.h*.52;
        g.save();
        g.translate(x,y);
        g.fillStyle='#45362b';
        g.strokeStyle='#ffcd86';
        g.lineWidth=1.6;
        g.beginPath();g.moveTo(-e.r*.84,-5);g.lineTo(0,-9);g.lineTo(e.r*.84,-5);
        g.lineTo(e.r*.62,6);g.lineTo(0,12);g.lineTo(-e.r*.62,6);g.closePath();g.fill();g.stroke();
        g.fillStyle='#ffdf9c';
        g.fillRect(-e.r*.55,0,e.r*1.1*e.plate/e.maxPlate,3);
        g.restore();
      }
      if(e.kind === 'shieldguard' || e.kind === 'conjurer' || e.kind==='lancer'){
        const x=SX(e.x), y=SY(e.y)-e.h;
        g.save();
        g.strokeStyle='#142028'; g.lineWidth=2.5;
        g.fillStyle=e.kind==='shieldguard'?'#85edd7':e.kind==='lancer'?'#ffc292':'#edb0ff';
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
      if(e.repair && !e.repair.target.dead){
        const ally=e.repair.target;
        drawHazardCircle(g,ally.x,ally.y,ally.r+8,'#aef5a8',1-e.repair.left);
        const x=SX(ally.x), y=SY(ally.y)-ally.h-7;
        g.save();
        g.fillStyle='#baf6aa';g.fillRect(x-5,y-1,10,2);g.fillRect(x-1,y-5,2,10);
        g.restore();
      }
      if(e.cast) drawHazardCircle(g,e.cast.x,e.cast.y,23,'#e9a4ff',1-e.cast.left/1.12);
      if(e.commander){
        const x=SX(e.x), y=SY(e.y)-e.h-14;
        g.save();
        g.strokeStyle='#211918';g.fillStyle=e.commander.col;g.lineWidth=2.5;
        g.beginPath();g.moveTo(x-7,y-4);g.lineTo(x,y+3);g.lineTo(x+7,y-4);
        g.lineTo(x+6,y+2);g.lineTo(x,y+7);g.lineTo(x-6,y+2);g.closePath();g.stroke();g.fill();
        g.restore();
      }
    }
  }

  return { detach, supported, interrupt, absorb, motion, draw };
})();
