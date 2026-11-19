'use strict';

const WeaponLinks = (() => {
  const rail = { talent:'pierce', count:2, range:138, share:.42, color:'#d9c0ff' };
  const ember = { talent:'burn', count:2, range:105, seconds:2.6, interval:.65, base:6, perLevel:2, color:'#ff9a53' };
  const flameSource = 'flamer';
  const emberSource = 'ember';
  const railText = '穿透弹联动：普攻主弹第二次命中后，向 '+rail.range+' 范围内最多 '+rail.count+' 名未命中敌人分叉，每道造成原弹基础伤害的 '+Math.round(rail.share*100)+'%。主动光束不分叉。';
  const emberText = '燃烧弹联动：自身普攻或烈焰吐息直接击破或灼烧击破，点燃 '+ember.range+' 范围内最多 '+ember.count+' 名敌人，持续 '+ember.seconds+' 秒，每秒 '+ember.base+' + '+ember.perLevel+' × 燃烧弹等级的伤害。间隔 '+ember.interval+' 秒，余烬击破不再扩散。';

  function weaponHint(id){
    return id==='sniper' ? railText : id==='flamer' ? emberText : '';
  }

  function talentHint(talent){
    const weapon=G.weapon;
    if(weapon==='sniper' && talent===rail.talent) return ' · 磁轨炮普攻二次命中后分叉。';
    if(weapon==='flamer' && talent===ember.talent) return ' · 火焰喷射的击破可扩散余烬。';
    return '';
  }

  function railEnabled(){ return G.skills[rail.talent] > 0; }
  function emberEnabled(){ return G.skills[ember.talent] > 0; }

  function trail(x,y,tx,ty,color,life,width,electric){
    G.parts.push({x,y,vx:0,vy:0,life,max:life,col:color,r:1,
      line:{x2:tx,y2:ty,width,electric}});
  }

  function splitRail(b,field,time){
    if(!b.railFork || b.hits.length!==2) return;
    b.railFork=false;
    const targets=b.railTargets=[];
    for(let i=0;i<rail.count;i++){
      const contact=field.nearest(b.x,b.y,rail.range,time,(e,x,y)=>!b.hits.includes(e) &&
        !targets.includes(e) && (e!==G.boss || !b.bossHit) && FieldMaps.lineOpen(b.x,b.y,x,y));
      if(!contact) break;
      const {e,x,y}=contact;
      targets.push(e);
      trail(b.x,b.y,x,y,rail.color,.18,3.2,false);
      hitProjectileTarget(b,e,b.dmg*rail.share,false,x,y,{pct:b.pct || 0});
    }
  }

  function spreadEmbers(origin){
    if(!emberEnabled() || G.t<G.emberSpreadAt+ember.interval) return;
    const targets=projectileTargets().filter(e=>e!==origin && projectileTargetActive(e) &&
      d2(origin.x,origin.y,e.x,e.y)<=ember.range**2 && FieldMaps.lineOpen(origin.x,origin.y,e.x,e.y));
    if(!targets.length) return;
    targets.sort((a,b)=>d2(origin.x,origin.y,a.x,a.y)-d2(origin.x,origin.y,b.x,b.y));
    G.emberSpreadAt=G.t;
    const dps=ember.base+ember.perLevel*G.skills[ember.talent];
    for(const target of targets.slice(0,ember.count)){
      setBurn(target,ember.seconds,dps,emberSource);
      trail(origin.x,origin.y,target.x,target.y,ember.color,.25,2.6,true);
    }
  }

  function applyBurn(unit,duration,damage,source){
    const active=unit.burnT>0;
    if(!active || damage>=unit.burnDps){
      const remaining=active && unit.burnSource===source ? unit.burnSourceT : 0;
      unit.burnSource=source;
      unit.burnSourceT=source===flameSource ? Math.max(duration,remaining) : 0;
    }
    unit.burnT=Math.max(active ? unit.burnT : 0,duration);
    unit.burnDps=Math.max(active ? unit.burnDps : 0,damage);
  }

  function tickBurn(unit,dt){
    const seconds=Math.min(unit.burnT,dt);
    const seeded=unit.burnSource===flameSource && unit.burnSourceT>0 &&
      unit.hp<=unit.burnDps*Math.min(seconds,unit.burnSourceT);
    if(unit.burnSourceT>0) unit.burnSourceT=Math.max(0,unit.burnSourceT-seconds);
    unit.burnT-=seconds;
    unit.hp-=unit.burnDps*seconds;
    return seeded;
  }

  return {weaponHint,talentHint,railEnabled,emberEnabled,flameSource,splitRail,spreadEmbers,applyBurn,tickBurn};
})();
