/* 敌方技能表现只消费战斗状态，不改变伤害、前摇或触发距离。 */
const EnemyEffects = (() => {
  const profiles = {
    slug:{ color:'#ffad6f', core:'#fff0cb', edge:'#351927', tail:3.6, wind:.36 },
    needle:{ color:'#98f9dc', core:'#ecfff7', edge:'#142e39', tail:6.8, wind:.64 },
    glyph:{ color:'#dda4ff', core:'#fff0ff', edge:'#291b47', tail:2.7, wind:.52 },
    drone:{ color:'#ff8f9d', core:'#ffebd9', edge:'#391a29', tail:4.3, wind:.44 },
    fuse:{ color:'#ff8c59', core:'#fff2bd', edge:'#351827', tail:2.7 },
    seeker:{ color:'#e5a9f7', core:'#fff1fa', edge:'#261935', tail:3.6 },
    volley:{ color:'#ffa492', core:'#fff0d9', edge:'#2e1a28', tail:2.9 }
  };
  const pulses = {
    ward:['#9bf1d8',.24], fracture:['#adffe5',.32], summon:['#e9b3ff',.38],
    ram:['#ffd392',.21], lance:['#9cf5df',.19], fuse:['#ff8a5c',.37],
    shock:['#ffc482',.35], phase:['#c5aeff',.23]
  };
  const burstLimit = 42;
  const compactShots = new Map();
  const stampRadius = 8, stampX = 46, stampY = 12;
  const events = Array.from({length:burstLimit},()=>({at:-Infinity}));
  let cursor = 0;

  function shotKind(e){
    if(e.beam || e.kind === 'lancer') return 'needle';
    if(e.kind === 'caster' || e.kind === 'conjurer') return 'glyph';
    if(e.kind === 'drone') return 'drone';
    return 'slug';
  }

  function color(kind){ return (profiles[kind] || profiles.volley).color; }

  function bulletType(b){
    if(profiles[b.fxKind]) return b.fxKind;
    if(b.owner === 'boss' && profiles[b.kind]) return b.kind;
    if(b.homing) return 'seeker';
    return b.r >= 4.7 ? 'fuse' : 'volley';
  }

  function clear(){
    for(const event of events) event.at = -Infinity;
    cursor = 0;
  }

  function burst(type,x,y,angle=0,radius=0,tint){
    const event = events[cursor];
    cursor = (cursor+1)%burstLimit;
    const pulse = pulses[type];
    event.type = type;
    event.x = x; event.y = y; event.angle = angle; event.radius = radius;
    event.at = G.t; event.stage = G.stage; event.floor = FieldMaps.underground();
    event.color = tint || (pulse ? pulse[0] : color(type));
    event.life = pulse ? pulse[1] : .17;
  }

  function impact(b){
    burst(bulletType(b),b.x,b.y,Math.atan2(b.vy,b.vx),b.r,b.col);
  }

  function observe(e){
    const ward = !e.dead && e.ward && EnemyTactics.supported(e.ward) ? e.ward : null;
    if(e.fxWard && e.fxWard !== ward) burst('fracture',e.fxWard.x,e.fxWard.y,0,e.fxWard.r+3);
    if(ward && e.fxWard !== ward) burst('ward',ward.x,ward.y,0,ward.r+3);
    e.fxWard = ward;
    if(e.fxPlate > 0 && !(e.plate > 0)) burst('fracture',e.x,e.y,0,e.r+3);
    e.fxPlate = e.plate;
    if(e.fxCast && !e.cast){
      const cast = e.fxCast;
      burst(cast.left <= 0 && !e.dead ? 'summon' : 'fracture',cast.x,cast.y,0,cast.left <= 0 ? 23 : 10);
    }
    if(e.cast && e.fxCast !== e.cast) e.fxCastWind = e.cast.left;
    e.fxCast = e.cast;
    if(e.fxRepair && !e.repair){
      const previous = e.fxRepair, target = previous.target;
      if(target && !target.dead && previous.left <= 0) burst('ward',target.x,target.y,0,target.r+5);
    }
    if(e.repair && e.fxRepair !== e.repair) e.fxRepairWind = e.repair.left;
    e.fxRepair = e.repair;
    if(e.fxPress && !e.press && !e.dead){
      const a = e.fxPress;
      if(a.left <= 0){
        if(a.rays){
          for(const ray of a.rays) burst('lance',a.x,a.y,ray.angle);
        } else if(a.radius > 0) burst('shock',a.x,a.y,0,a.radius);
      }
    }
    e.fxPress = e.press;
    const elite = e.eliteAct;
    if(elite && e.eliteVariant === 'ram' && elite.t >= ELITE_VARIANTS.ram.wind &&
      !(e.fxRam === elite)) burst('ram',e.x,e.y,elite.angle);
    e.fxRam = elite && e.eliteVariant === 'ram' && elite.t >= ELITE_VARIANTS.ram.wind ? elite : null;
    if(e.fxElite && !elite && e.eliteVariant === 'lance' && e.fxElite.t >= ELITE_VARIANTS.lance.wind && !e.dead){
      burst('lance',e.x,e.y,e.fxElite.angle);
    }
    e.fxElite = elite;
  }

  function diamond(g,x,y,r,ax=1,ay=1){
    g.beginPath();
    g.moveTo(x+r*ax,y); g.lineTo(x,y+r*ay); g.lineTo(x-r*ax,y); g.lineTo(x,y-r*ay);
    g.closePath();
  }

  function drawBullet(g,b,detail){
    const r = b.r, x = SX(b.x), y = SY(b.y)-BULLET_H;
    const type = bulletType(b);
    const p = profiles[type] || profiles.volley;
    const accent = b.fxKind ? p.color : (b.col || p.color);
    const tail = r*p.tail*(detail ? 1 : .7);
    if(x < -tail-10 || x > VW+tail+10 || y < -tail-10 || y > VH+tail+10) return;
    const angle = Math.atan2(b.vy*KZ,b.vx);
    g.save();
    if(detail && r >= 4){
      g.globalAlpha = .47;
      g.fillStyle = '#141118';
      g.beginPath(); g.ellipse(x,y+BULLET_H,r*.8,Math.max(1,r*.34),0,0,TAU); g.fill();
    }
    g.translate(x,y); g.rotate(angle);
    if(!detail){
      // Dense volleys share a small projectile sprite. Position, angle and radius stay per bullet.
      const stamp = compactShot(type,accent);
      const scale = r/stampRadius;
      g.globalAlpha = 1;
      g.drawImage(stamp,-stampX*scale,-stampY*scale,stamp.width*scale,stamp.height*scale);
    } else {
      const spin = type === 'glyph' ? G.t*4+b.x*.01 : G.t*7+b.x*.024;
      paintShot(g,type,p,accent,r,tail,true,spin);
    }
    g.restore();
  }

  function compactShot(type,accent){
    const key = type+'|'+accent;
    let stamp = compactShots.get(key);
    if(stamp) return stamp;
    stamp = document.createElement('canvas');
    stamp.width = 60; stamp.height = 24;
    const g = stamp.getContext('2d');
    g.translate(stampX,stampY);
    const p = profiles[type];
    paintShot(g,type,p,accent,stampRadius,stampRadius*p.tail*.7,false,0);
    if(compactShots.size>=64) compactShots.delete(compactShots.keys().next().value);
    compactShots.set(key,stamp);
    return stamp;
  }

  function paintShot(g,type,p,accent,r,tail,detail,spin){
    g.strokeStyle = p.edge;
    g.globalAlpha = .76;g.lineWidth = Math.max(1.3,r*.56);
    g.beginPath();g.moveTo(-tail*.80,0);g.lineTo(0,0);g.stroke();
    g.fillStyle = accent;
    g.globalAlpha = .40;
    g.beginPath(); g.moveTo(-tail,0); g.lineTo(0,-r*.74); g.lineTo(0,r*.74); g.closePath(); g.fill();
    g.globalAlpha = .82;
    g.fillRect(-tail*.69,-.48,tail*.66,.96);
    if(detail && (type === 'needle' || type === 'drone')){
      g.fillRect(-tail*.86,-r*.64,tail*.62,.63);
      g.fillRect(-tail*.67,r*.54,tail*.5,.63);
    }
    g.globalAlpha = 1;
    g.fillStyle = accent; g.strokeStyle = p.edge; g.lineWidth = 1.3;
    if(type === 'needle' || type === 'slug' || type === 'drone'){
      g.beginPath(); g.moveTo(r,0); g.lineTo(-r*.2,-r*.82); g.lineTo(-r,0); g.lineTo(-r*.2,r*.82); g.closePath();
    } else if(type === 'glyph'){
      g.rotate(spin);
      diamond(g,0,0,r,1,.94);
    } else {
      g.beginPath(); g.arc(0,0,r,0,TAU);
    }
    g.fill(); g.stroke();
    g.fillStyle = p.core;
    if(type === 'needle' || type === 'slug'){
      g.fillRect(-r*.44,-Math.max(.5,r*.22),r*1.08,Math.max(1,r*.44));
    } else if(type === 'glyph'){
      diamond(g,0,0,r*.42); g.fill();
    } else if(type === 'drone'){
      g.beginPath(); g.moveTo(r*.55,0);g.lineTo(-r*.37,-r*.39);g.lineTo(-r*.37,r*.39);g.closePath();g.fill();
    } else {
      g.beginPath(); g.arc(r*.12,-r*.18,Math.max(.70,r*.34),0,TAU); g.fill();
      if(type === 'seeker' || type === 'fuse'){
        g.strokeStyle = accent; g.lineWidth = .9;
        g.beginPath(); g.arc(0,0,r+1.5,spin,spin+1.3); g.stroke();
      }
    }
  }

  function fixedRing(g,r,color,fill){
    if(r<=0) return;
    g.lineWidth = 1.35;
    g.beginPath();g.ellipse(0,0,r,r*KZ,0,0,TAU);
    if(fill){ g.globalAlpha *= .14;g.fillStyle=color;g.fill();g.globalAlpha /= .14; }
    g.strokeStyle=color;g.stroke();
  }

  function sourceCue(g,x,y,a,f,kind){
    const p = profiles[kind] || profiles.slug, size = 5+f*4;
    g.save();
    g.translate(x,y);g.rotate(Math.atan2(Math.sin(a)*KZ,Math.cos(a)));
    g.globalAlpha=.24+f*.74;
    g.strokeStyle=p.edge;g.fillStyle=p.color;g.lineWidth=2;
    if(kind === 'glyph'){
      diamond(g,0,0,size,.8,1);
      g.stroke();g.fill();
      g.strokeStyle=p.core;g.lineWidth=1;
      diamond(g,0,0,size*.66,.8,1);g.stroke();
    } else {
      g.beginPath();g.moveTo(-size,-size*.71);g.lineTo(0,-size*.71);
      g.lineTo(size,0);g.lineTo(0,size*.71);g.lineTo(-size,size*.71);
      g.stroke();g.strokeStyle=p.color;g.lineWidth=1;g.stroke();
      g.fillStyle=p.core;g.fillRect(1,-1,Math.max(1,size*f*.7),2);
    }
    g.restore();
  }

  function summonGlyph(g,e,charge){
    const cast=e.cast, spin=reducedEffects ? 0 : G.t*2, radius=14;
    g.save();g.translate(SX(cast.x),SY(cast.y));g.scale(1,KZ);
    g.globalAlpha=.46+.46*charge;g.strokeStyle='#e4baff';g.lineWidth=1.25;
    g.beginPath();
    for(let i=0;i<4;i++){
      const a=spin+i*Math.PI*.5, x=Math.cos(a)*radius, y=Math.sin(a)*radius;
      if(i===0) g.moveTo(x,y);else g.lineTo(x,y);
    }
    g.closePath();g.stroke();
    g.fillStyle='#ffe2ff';diamond(g,0,0,2.5+charge*3);g.fill();
    g.restore();
  }

  function drawUnit(g,e){
    const x = SX(e.x), y = SY(e.y), p = G.p;
    if(e.dead || x < -330 || x > VW+330 || y < -330 || y > VH+330) return;
    if(e.spawnT > 0){
      if(e.summoner){
        g.save();g.translate(x,y);g.globalAlpha=.62*clamp(e.spawnT/.45,0,1);
        fixedRing(g,e.r+6,'#e9b3ff',true);g.restore();
      }
      return;
    }
    const dx=p.x-e.x, dy=p.y-e.y, dist2=dx*dx+dy*dy, kind=shotKind(e), spec=profiles[kind];
    const t=e.shootT;
    if(e.shoot>0 && !e.eliteAct && !e.press && !(e.stun>0) && t>0 && t<spec.wind && dist2<340**2){
      // 仅在能命中同一条视线时显示狙击预瞄；方向由当前玩家位置决定。
      const angle=Math.atan2(dy,dx), f=1-t/spec.wind, sx=x+Math.cos(angle)*10, sy=y-BULLET_H+Math.sin(angle)*10*KZ;
      const clear = FieldMaps.lineOpen(e.x,e.y,p.x,p.y);
      if(clear) sourceCue(g,sx,sy,angle,f,kind);
      if(kind === 'needle' && f>.20 && clear){
        const d=Math.min(240,Math.sqrt(dist2));
        const ex=x+Math.cos(angle)*d, ey=y-BULLET_H+Math.sin(angle)*d*KZ;
        g.save();
        g.globalAlpha=.24+f*.43;g.strokeStyle=spec.edge;g.lineWidth=3.4;
        g.beginPath();g.moveTo(sx,sy);g.lineTo(ex,ey);g.stroke();
        g.strokeStyle=spec.color;g.lineWidth=.92;g.setLineDash([8,4]);g.lineDashOffset=-f*12;g.stroke();
        g.restore();
      }
    }
    if(e.boom && dist2 < 52**2){
      g.save();g.translate(x,y);g.globalAlpha=.58;
      fixedRing(g,e.r+3,SCENES[G.stage].accent,false);
      g.translate(0,-e.h*.48);
      const f=clamp(1-Math.sqrt(dist2)/52,0,1);
      sourceCue(g,0,0,Math.atan2(dy,dx),.38+f*.62,'drone');
      g.restore();
    }
    if(e.eliteAct && e.eliteVariant === 'ram' && e.eliteAct.t >= ELITE_VARIANTS.ram.wind){
      const act=e.eliteAct, length=Math.min(26,Math.hypot(e.x-act.x,e.y-act.y));
      g.save();g.globalAlpha=.62;g.strokeStyle='#ffc886';g.lineWidth=2;
      for(let side=-1;side<=1;side+=2){
        const sx=x-side*Math.sin(act.angle)*e.r*.8, sy=y+side*Math.cos(act.angle)*e.r*.8*KZ;
        g.beginPath();g.moveTo(sx,sy);g.lineTo(sx-Math.cos(act.angle)*length,sy-Math.sin(act.angle)*length*KZ);g.stroke();
      }
      g.restore();
    }
    const action=e.press || e.repair || e.cast || e.eliteAct;
    if(action){
      const charge=e.press ? 1-action.left/action.wind : e.repair ? 1-action.left/(e.fxRepairWind||action.wind||1) :
        e.cast ? 1-action.left/(e.fxCastWind||action.left||1) : action.t/(ELITE_VARIANTS[e.eliteVariant]?.wind||1);
      const a=e.eliteAct?.angle ?? Math.atan2(dy,dx);
      sourceCue(g,x,y-e.h*.67,a,clamp(charge,0,1),e.cast ? 'glyph' : e.repair || e.press?.rays || e.eliteVariant==='lance' ? 'needle' : 'slug');
      if(e.cast) summonGlyph(g,e,clamp(charge,0,1));
    }
    if(e.plate>0 && e.maxPlate>0){
      const f=clamp(e.plate/e.maxPlate,0,1);
      g.save();g.translate(x,y-e.h*.28);g.strokeStyle='#ffdeb4';g.globalAlpha=.38+.40*f;g.lineWidth=1.2;
      g.beginPath();g.ellipse(0,0,e.r*1.13,e.r*.50,0,Math.PI*.11,Math.PI*(.11+.77*f));g.stroke();
      g.restore();
    }
  }

  function drawBursts(g){
    const floor=FieldMaps.underground();
    const detail=QLEVEL>0 && !reducedEffects;
    for(const event of events){
      const age=G.t-event.at, f=age/event.life;
      if(!(f>=0 && f<1) || event.stage!==G.stage || event.floor!==floor) continue;
      const x=SX(event.x), y=SY(event.y), r=event.radius;
      if(x<-r-44 || x>VW+r+44 || y<-r-44 || y>VH+r+44) continue;
      const pulse = pulses[event.type];
      g.save();g.translate(x,y);g.globalAlpha=(1-f)*.88;
      if(pulse && r>0){
        fixedRing(g,r,event.color,true);
        g.globalAlpha *= .57;
        fixedRing(g,r*(.2+.8*f),event.color,false);
        const n=detail ? 8 : 4;
        g.fillStyle=event.color;
        for(let j=0;j<n;j++){
          const a=j*TAU/n + .2, rr=r*(.52+.48*f);
          diamond(g,Math.cos(a)*rr,Math.sin(a)*rr*KZ,2.4*(1-f)+.6,.92,.78);
          g.fill();
        }
      } else {
        g.translate(0,-BULLET_H);
        g.rotate(Math.atan2(Math.sin(event.angle)*KZ,Math.cos(event.angle)));
        const length=(r ? 6+r : event.type === 'needle' || event.type === 'lance' ? 25 : 15)*(1-.55*f);
        g.fillStyle=event.color;
        diamond(g,length*.12,0,length,1,.29);g.fill();
        g.fillStyle='#fff0dc';g.fillRect(-2,-.9,length*.59,1.8);
        if(detail){
          g.strokeStyle=event.color;g.lineWidth=.75;
          g.beginPath();
          g.moveTo(-length*.14,-2);g.lineTo(-length*.89,-5-3*f);
          g.moveTo(-length*.14,2);g.lineTo(-length*.78,5+3*f);g.stroke();
        }
      }
      g.restore();
    }
  }

  return { shotKind, color, clear, burst, impact, observe, drawBullet, drawUnit, drawBursts };
})();
