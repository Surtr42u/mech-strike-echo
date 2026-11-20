/* 敌方技能表现只消费战斗状态，不改变伤害、前摇或触发距离。 */
const EnemyEffects = (() => {
  /* 拖尾整体收短：3 倍怪量下弹幕只保留能读出方向的一小段。 */
  const profiles = {
    slug:{ color:'#ffad6f', core:'#fff0cb', edge:'#351927', tail:2.2, wind:.36 },
    needle:{ color:'#98f9dc', core:'#ecfff7', edge:'#142e39', tail:4.0, wind:.64 },
    glyph:{ color:'#dda4ff', core:'#fff0ff', edge:'#291b47', tail:1.7, wind:.52 },
    drone:{ color:'#ff8f9d', core:'#ffebd9', edge:'#391a29', tail:2.6, wind:.44 },
    fuse:{ color:'#ff8c59', core:'#fff2bd', edge:'#351827', tail:1.7 },
    seeker:{ color:'#e5a9f7', core:'#fff1fa', edge:'#261935', tail:2.3 },
    volley:{ color:'#ffa492', core:'#fff0d9', edge:'#2e1a28', tail:1.9 }
  };
  /* 脉冲色只负责"发生了什么事"，亮度和寿命都压到不抢读血条的程度。 */
  const pulses = {
    ward:['#9bf1d8',.17], fracture:['#adffe5',.20], summon:['#e9b3ff',.24],
    ram:['#ffd392',.15], lance:['#9cf5df',.14], fuse:['#ff8a5c',.24],
    shock:['#ffc482',.23], phase:['#c5aeff',.16]
  };
  const burstLimit = 36;
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

  /* 敌弹统一吃场景强调色：同一屏弹幕不再橙/青/紫混成霓虹。 */
  function accentOf(p){
    const scene = SCENES[G.stage];
    return scene ? scene.accent : p.color;
  }

  function color(kind){ return accentOf(profiles[kind] || profiles.volley); }

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
    event.life = pulse ? pulse[1] : .13;
  }

  function impact(b){
    burst(bulletType(b),b.x,b.y,Math.atan2(b.vy,b.vx),b.r,b.col);
  }

  function observe(e){
    const ward = !e.dead && e.ward && EnemyTactics.supported(e.ward) ? e.ward : null;
    if(e.fxWard && e.fxWard !== ward) burst('fracture',e.fxWard.x,e.fxWard.y,0,e.fxWard.r+2);
    if(ward && e.fxWard !== ward) burst('ward',ward.x,ward.y,0,ward.r+2);
    e.fxWard = ward;
    if(e.fxPlate > 0 && !(e.plate > 0)) burst('fracture',e.x,e.y,0,e.r+2);
    e.fxPlate = e.plate;
    if(e.fxCast && !e.cast){
      const cast = e.fxCast;
      burst(cast.left <= 0 && !e.dead ? 'summon' : 'fracture',cast.x,cast.y,0,cast.left <= 0 ? 16 : 8);
    }
    if(e.cast && e.fxCast !== e.cast) e.fxCastWind = e.cast.left;
    e.fxCast = e.cast;
    if(e.fxRepair && !e.repair){
      const previous = e.fxRepair, target = previous.target;
      if(target && !target.dead && previous.left <= 0) burst('ward',target.x,target.y,0,target.r+3);
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
    /* Boss 弹保留自己的身份色；小怪弹一律用本关强调色。 */
    const accent = b.owner === 'boss' && b.col ? b.col : (b.fxKind ? accentOf(p) : (b.col || accentOf(p)));
    const tail = r*p.tail*(detail ? 1 : .62);
    if(x < -tail-10 || x > VW+tail+10 || y < -tail-10 || y > VH+tail+10) return;
    const angle = Math.atan2(b.vy*KZ,b.vx);
    g.save();
    if(detail && r >= 4){
      g.globalAlpha = .32;
      g.fillStyle = '#141118';
      g.beginPath(); g.ellipse(x,y+BULLET_H,r*.66,Math.max(1,r*.30),0,0,TAU); g.fill();
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
    paintShot(g,type,p,accent,stampRadius,stampRadius*p.tail*.62,false,0);
    if(compactShots.size>=64) compactShots.delete(compactShots.keys().next().value);
    compactShots.set(key,stamp);
    return stamp;
  }

  function paintShot(g,type,p,accent,r,tail,detail,spin){
    /* 弹体保持清晰：暗边 + 细尾焰，不再用宽描边堆出"光晕"。 */
    g.strokeStyle = p.edge;
    g.globalAlpha = .58;g.lineWidth = Math.max(1,r*.42);
    g.beginPath();g.moveTo(-tail*.74,0);g.lineTo(0,0);g.stroke();
    g.fillStyle = accent;
    g.globalAlpha = .26;
    g.beginPath(); g.moveTo(-tail,0); g.lineTo(0,-r*.62); g.lineTo(0,r*.62); g.closePath(); g.fill();
    g.globalAlpha = .66;
    g.fillRect(-tail*.62,-.42,tail*.58,.84);
    if(detail && (type === 'needle' || type === 'drone')){
      g.globalAlpha = .48;
      g.fillRect(-tail*.76,-r*.54,tail*.5,.56);
      g.fillRect(-tail*.60,r*.46,tail*.42,.56);
    }
    g.globalAlpha = 1;
    g.fillStyle = accent; g.strokeStyle = p.edge; g.lineWidth = 1.1;
    if(type === 'needle' || type === 'slug' || type === 'drone'){
      g.beginPath(); g.moveTo(r,0); g.lineTo(-r*.2,-r*.78); g.lineTo(-r,0); g.lineTo(-r*.2,r*.78); g.closePath();
    } else if(type === 'glyph'){
      g.rotate(spin);
      diamond(g,0,0,r,1,.94);
    } else {
      g.beginPath(); g.arc(0,0,r,0,TAU);
    }
    g.fill(); g.stroke();
    g.fillStyle = p.core;
    if(type === 'needle' || type === 'slug'){
      g.fillRect(-r*.42,-Math.max(.5,r*.20),r*.98,Math.max(1,r*.40));
    } else if(type === 'glyph'){
      diamond(g,0,0,r*.38); g.fill();
    } else if(type === 'drone'){
      g.beginPath(); g.moveTo(r*.50,0);g.lineTo(-r*.34,-r*.34);g.lineTo(-r*.34,r*.34);g.closePath();g.fill();
    } else {
      g.beginPath(); g.arc(r*.10,-r*.16,Math.max(.62,r*.30),0,TAU); g.fill();
      if(type === 'seeker' || type === 'fuse'){
        g.globalAlpha = .7;
        g.strokeStyle = accent; g.lineWidth = .75;
        g.beginPath(); g.arc(0,0,r+1.1,spin,spin+1.1); g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  function fixedRing(g,r,color,fill){
    if(r<=0) return;
    g.lineWidth = 1.2;
    g.beginPath();g.ellipse(0,0,r,r*KZ,0,0,TAU);
    if(fill){ g.globalAlpha *= .14;g.fillStyle=color;g.fill();g.globalAlpha /= .14; }
    g.strokeStyle=color;g.stroke();
  }

  function sourceCue(g,x,y,a,f,kind){
    const p = profiles[kind] || profiles.slug, accent = accentOf(p), size = 4.5+f*3;
    g.save();
    g.translate(x,y);g.rotate(Math.atan2(Math.sin(a)*KZ,Math.cos(a)));
    g.globalAlpha=.16+f*.52;
    g.strokeStyle=p.edge;g.fillStyle=accent;g.lineWidth=1.5;
    if(kind === 'glyph'){
      diamond(g,0,0,size,.8,1);
      g.stroke();g.fill();
      g.strokeStyle=p.core;g.lineWidth=.8;
      diamond(g,0,0,size*.64,.8,1);g.stroke();
    } else {
      g.beginPath();g.moveTo(-size,-size*.68);g.lineTo(0,-size*.68);
      g.lineTo(size,0);g.lineTo(0,size*.68);g.lineTo(-size,size*.68);
      g.stroke();g.strokeStyle=accent;g.lineWidth=.85;g.stroke();
      g.fillStyle=p.core;g.fillRect(1,-1,Math.max(1,size*f*.5),2);
    }
    g.restore();
  }

  function summonGlyph(g,e,charge){
    const cast=e.cast, spin=reducedEffects ? 0 : G.t*1.6, radius=11;
    g.save();g.translate(SX(cast.x),SY(cast.y));g.scale(1,KZ);
    g.globalAlpha=.20+.26*charge;g.strokeStyle='#e4baff';g.lineWidth=1;
    g.beginPath();
    for(let i=0;i<4;i++){
      const a=spin+i*Math.PI*.5, x=Math.cos(a)*radius, y=Math.sin(a)*radius;
      if(i===0) g.moveTo(x,y);else g.lineTo(x,y);
    }
    g.closePath();g.stroke();
    g.globalAlpha=.24+.30*charge;
    g.fillStyle='#ffe2ff';diamond(g,0,0,2+charge*2);g.fill();
    g.restore();
  }

  function drawUnit(g,e){
    const x = SX(e.x), y = SY(e.y), p = G.p, low = QLEVEL === 0 || reducedEffects;
    if(e.dead || x < -330 || x > VW+330 || y < -330 || y > VH+330) return;
    if(e.spawnT > 0){
      if(e.summoner && !low){
        g.save();g.translate(x,y);g.globalAlpha=.34*clamp(e.spawnT/.45,0,1);
        fixedRing(g,e.r+4,'#e9b3ff',true);g.restore();
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
        const d=Math.min(200,Math.sqrt(dist2));
        const ex=x+Math.cos(angle)*d, ey=y-BULLET_H+Math.sin(angle)*d*KZ;
        g.save();
        g.globalAlpha=.13+f*.26;g.strokeStyle=spec.edge;g.lineWidth=low ? 2.2 : 2.6;
        g.beginPath();g.moveTo(sx,sy);g.lineTo(ex,ey);g.stroke();
        g.globalAlpha=.34+f*.40;
        g.strokeStyle=accentOf(spec);g.lineWidth=.8;g.setLineDash([7,4]);g.lineDashOffset=-f*10;g.stroke();
        g.restore();
      }
    }
    if(e.boom && dist2 < 52**2){
      g.save();g.translate(x,y);g.globalAlpha=.35;
      fixedRing(g,e.r+2,SCENES[G.stage].accent,false);
      g.translate(0,-e.h*.48);
      const f=clamp(1-Math.sqrt(dist2)/52,0,1);
      sourceCue(g,0,0,Math.atan2(dy,dx),.38+f*.50,'drone');
      g.restore();
    }
    if(e.eliteAct && e.eliteVariant === 'ram' && e.eliteAct.t >= ELITE_VARIANTS.ram.wind){
      const act=e.eliteAct, length=Math.min(22,Math.hypot(e.x-act.x,e.y-act.y));
      g.save();g.globalAlpha=.42;g.strokeStyle='#ffc886';g.lineWidth=1.4;
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
      sourceCue(g,x,y-e.h*.64,a,clamp(charge,0,1),e.cast ? 'glyph' : e.repair || e.press?.rays || e.eliteVariant==='lance' ? 'needle' : 'slug');
      if(e.cast && !low) summonGlyph(g,e,clamp(charge,0,1));
    }
    if(e.plate>0 && e.maxPlate>0){
      const f=clamp(e.plate/e.maxPlate,0,1);
      g.save();g.translate(x,y-e.h*.28);g.strokeStyle='#ffdeb4';g.globalAlpha=low ? .26 : .24+.20*f;g.lineWidth=1;
      g.beginPath();g.ellipse(0,0,e.r*1.08,e.r*.46,0,Math.PI*.11,Math.PI*(.11+.77*f));g.stroke();
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
      g.save();g.translate(x,y);g.globalAlpha=(1-f)*.62;
      if(pulse && r>0){
        fixedRing(g,r,event.color,true);
        g.globalAlpha *= .38;
        fixedRing(g,r*(.2+.8*f),event.color,false);
        const n=detail ? 5 : 3;
        g.fillStyle=event.color;
        for(let j=0;j<n;j++){
          const a=j*TAU/n + .2, rr=r*(.52+.48*f);
          diamond(g,Math.cos(a)*rr,Math.sin(a)*rr*KZ,1.8*(1-f)+.45,.92,.78);
          g.fill();
        }
      } else {
        g.translate(0,-BULLET_H);
        g.rotate(Math.atan2(Math.sin(event.angle)*KZ,Math.cos(event.angle)));
        const length=(r ? 4+r*.8 : event.type === 'needle' || event.type === 'lance' ? 17 : 11)*(1-.55*f);
        g.fillStyle=event.color;
        diamond(g,length*.12,0,length,1,.26);g.fill();
        g.fillStyle='#ffe9cf';g.globalAlpha*=.7;g.fillRect(-2,-.7,length*.52,1.4);
        g.globalAlpha=(1-f)*.62;
        if(detail){
          g.strokeStyle=event.color;g.lineWidth=.65;
          g.beginPath();
          g.moveTo(-length*.14,-2);g.lineTo(-length*.82,-4-2.4*f);
          g.moveTo(-length*.14,2);g.lineTo(-length*.72,4+2.4*f);g.stroke();
        }
      }
      g.restore();
    }
  }

  return { shotKind, color, clear, burst, impact, observe, drawBullet, drawUnit, drawBursts };
})();
