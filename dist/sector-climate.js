/* Outdoor conditions and one usable installation in each of sectors 02–05. */
const SectorClimate = (() => {
  const skies = {
    clear:{name:'晴', particles:null}, dust:{name:'扬尘', particles:0},
    rain:{name:'阵雨', particles:1}, storm:{name:'雷雨', particles:1},
    snow:{name:'小雪', particles:2}, blizzard:{name:'暴雪', particles:2}
  };
  const forecasts = [
    ['dust','clear','rain','storm'], ['rain','storm','clear','storm'], ['snow','blizzard','clear','snow']
  ];
  const installations = [
    null,
    {id:'tower', name:'引雷塔', verb:'接通引雷塔', color:'#88e9ee', points:[[.56,.48]]},
    {id:'heater', name:'地热阀', verb:'打开地热阀', color:'#ffd48a', points:[[.57,.51]]},
    {id:'valve', name:'冷却阀', verb:'释放冷却液', color:'#83e3c6', points:[[.51,.46]]},
    {id:'gate', name:'相位锚', verb:'相位跃迁', color:'#c4acff', points:[[.45,.54],[.75,.29]]}
  ];
  const weatherPeriod=26, dayPeriod=104, gateCooldown=9;
  const daylightPalette=Array.from({length:33},(_,i)=>{
    const f=i/32;
    return 'rgb('+Math.round(21+204*f)+','+Math.round(43+113*f)+','+Math.round(88+9*f)+')';
  });
  const noMarkers=Object.freeze([]);
  let state;
  const routeNotes = [
    '地表电闸为地下升降机供电。', '引雷塔能把三道落雷引向敌群。',
    '地热阀融开冰墙，暖区可抵消暴雪减速。', '冷却阀可压制周围熔池十秒。',
    '相位双锚可往返跃迁，冷却九秒。'
  ];

  function begin(stage) {
    const spec=installations[stage];
    const pads=spec ? Object.freeze(spec.points.map(([x,y])=>Object.freeze({
      x:Math.round(ARENA.w*x),y:Math.round(ARENA.h*y),name:spec.name,color:spec.color
    }))) : noMarkers;
    state={stage, elapsed:0, sky:forecasts[stage]?.[0] || null, spec, pads,
      used:false, charges:0, cooling:0, jumpCd:0, strike:null, nextStrike:4};
  }

  function mapMarkers(){
    return FieldMaps.underground() ? noMarkers : (state?.pads ?? noMarkers);
  }

  function guideMarker(){
    if(!G.p || G.phase==='clear' || state?.used || state?.jumpCd>0) return null;
    let nearest=null, distance=Infinity;
    for(const pad of mapMarkers()){
      const dd=d2(G.p.x,G.p.y,pad.x,pad.y);
      if(dd<distance){ nearest=pad; distance=dd; }
    }
    return nearest;
  }

  function particles(stage) {
    if(!state || stage!==state.stage || !state.sky) return stage;
    return skies[state.sky].particles;
  }

  function prepareProps() {
    if(!state.spec) return;
    G.props=G.props.filter(p=>p.lm || state.pads.every(s=>Math.hypot(p.x-s.x,p.y-s.y)>p.r+52));
    if(state.spec.id==='heater'){
      const start=state.pads[0];
      for(let i=-2;i<=2;i++){
        G.props.push({kind:'crystal',x:start.x+58,y:start.y+i*31,r:17,h:42+6*(i%2===0),
          seed:63+i,solid:true,grp:-3,lift:0,iceSeal:true});
      }
    }
  }

  function nearPad() {
    if(!state?.spec || G.mode!=='play' || !G.p) return -1;
    return state.pads.findIndex(s=>d2(G.p.x,G.p.y,s.x,s.y)<44**2);
  }

  function activate() {
    const pad=nearPad();
    if(pad<0) return false;
    const spec=state.spec;
    if(spec.id==='gate'){
      if(state.jumpCd>0 || G.phase==='clear') return false;
      const dest=state.pads[1-pad];
      spark(G.p.x,G.p.y,8,spec.color,80);
      G.p.x=dest.x;G.p.y=dest.y;G.p.vx=0;G.p.vy=0;
      G.p.inv=Math.max(G.p.inv,.35);state.jumpCd=gateCooldown;
      spark(dest.x,dest.y,8,spec.color,80);
      banner('相位跃迁','双锚冷却 9 秒',1);
    } else {
      if(state.used) return false;
      state.used=true;
      if(spec.id==='tower'){
        state.charges=3;state.nextStrike=.25;
        if(state.strike && !state.strike.fired) state.strike=null;
        banner('引雷塔已接通','接下来三道落雷追踪敌群',1.4);
      } else if(spec.id==='heater'){
        G.props=G.props.filter(p=>!p.iceSeal);
        G.spawnAnchors=buildSpawnAnchors(SCENES[G.stage]);
        banner('地热阀已开启','东侧冰墙融开 · 阀区抵御暴雪减速',1.6);
      } else if(spec.id==='valve'){
        state.cooling=10;purgePools();
        banner('冷却阀泄压','十秒内阀区持续清除熔池、减速敌人',1.6);
      }
    }
    SFX.pick();paintInstruments(true);return true;
  }

  function purgePools() {
    const p=state.pads[0];
    for(let i=G.haz.length-1;i>=0;i--){
      const h=G.haz[i];
      if(h.kind==='pool' && d2(p.x,p.y,h.x,h.y)<=146**2) G.haz.splice(i,1);
    }
  }

  function frostFactor(unit) {
    if(!state || state.sky!=='blizzard' || unit.fly) return 1;
    const heater=state.pads[0];
    if(state.used && heater && d2(unit.x,unit.y,heater.x,heater.y)<135**2) return 1;
    return .88;
  }

  function makeStrike() {
    const friendly=state.charges>0;
    let target=G.p;
    if(friendly){
      let distance=Infinity;target=null;
      const consider=e=>{
        if(!e || e.dead || e.spawnT>0) return;
        const d=d2(G.p.x,G.p.y,e.x,e.y);
        if(d<distance){distance=d;target=e;}
      };
      for(const e of G.enemies) consider(e);
      consider(G.boss);
      if(!target){state.nextStrike=1;return;}
      state.charges--;
    }
    state.strike={x:target.x,y:target.y,r:friendly?64:42,t:0,wind:1.35,friendly,fired:false};
  }

  function resolveStrike(s) {
    const damage=s.friendly?58+G.stage*9:23+G.stage*4;
    for(const e of G.enemies){
      if(e.dead || e.spawnT>0 || d2(s.x,s.y,e.x,e.y)>(s.r+e.r)**2) continue;
      applyDamage(e,damage,false,e.x,e.y-5);
      if(s.friendly) e.stun=Math.max(e.stun||0,.8);
    }
    const boss=G.boss;
    if(boss && !boss.dead && d2(boss.x,boss.y,s.x,s.y)<=(s.r+boss.r)**2) damageBoss(boss,damage,false,boss.x,boss.y);
    if(!s.friendly){
      const radius=typeof playerRadius==='function' ? playerRadius(PLAYER_HAZARD_RADIUS) : PLAYER_HAZARD_RADIUS;
      if(d2(G.p.x,G.p.y,s.x,s.y)<=(s.r+radius)**2) hurtPlayer(9+2*G.stage);
    }
    spark(s.x,s.y,7,s.friendly?'#9ae9da':'#ffe299',95);
    G.rings.push({x:s.x,y:s.y,r:2,max:s.r,life:.27,maxLife:.27,col:s.friendly?'#9ae9da':'#ffb472',w:2});
  }

  function tick(dt) {
    if(!state || G.mode!=='play') return;
    state.elapsed+=dt;state.jumpCd=Math.max(0,state.jumpCd-dt);
    const forecast=forecasts[state.stage];
    if(forecast){
      const sky=forecast[Math.floor(state.elapsed/weatherPeriod)%forecast.length];
      if(sky!==state.sky) {state.sky=sky;G.env=buildEnv(state.stage);}
    }
    if(state.cooling>0) {
      state.cooling=Math.max(0,state.cooling-dt);
      purgePools();
      const p=state.pads[0];
      for(const e of G.enemies) if(!e.dead && d2(p.x,p.y,e.x,e.y)<=146**2){
        e.slowT=Math.max(e.slowT||0,.3);e.slowAmt=Math.max(e.slowAmt||0,.4);
      }
    }
    if(FieldMaps.underground() || G.phase==='clear'){
      state.strike=null;state.nextStrike=Math.max(2,state.nextStrike);return;
    }
    if(state.strike){
      const s=state.strike;s.t+=dt;
      if(!s.fired && s.t>=s.wind){s.fired=true;resolveStrike(s);}
      if(s.t>s.wind+.28){state.strike=null;state.nextStrike=state.charges?3.5:8.5;}
    } else if(state.sky==='storm' || state.charges){
      state.nextStrike-=dt;
      if(state.nextStrike<=0) makeStrike();
    }
  }

  function dayFraction() { return ((G.time/dayPeriod + [.43,.70,.12][state.stage])%1+1)%1; }
  function skyLabel() {
    if(!state?.sky || FieldMaps.underground()) return '';
    const t=dayFraction(), day=t<.16?'黎明':t<.47?'白昼':t<.64?'黄昏':'夜间';
    return ' · '+day+' / '+skies[state.sky].name;
  }
  function tintFloor(g) {
    if(!state?.sky || FieldMaps.underground()) return;
    const light=.5+.5*Math.cos((dayFraction()-.31)*Math.PI*2);
    g.save();g.globalAlpha=.17*(1-light)+.055;g.fillStyle=daylightPalette[Math.round(light*32)];
    g.fillRect(0,0,VW,VH);g.restore();
  }
  function distanceText() {
    let d=Infinity;
    for(const p of state.pads) d=Math.min(d,Math.hypot(p.x-G.p.x,p.y-G.p.y));
    return Math.ceil(d/10)+' 米';
  }
  function paintHud(){
    const h=byId('fieldObjective'), b=byId('fieldInteract');
    if(!state?.spec){h.hidden=true;b.hidden=true;return;}
    const id=state.spec.id;
    let hint=state.spec.name+' · '+distanceText(), label=state.spec.verb;
    if(id==='tower' && state.used) hint=state.charges?'引雷剩余 '+state.charges+' 次':'引雷塔已放电';
    if(id==='heater' && state.used) hint='地热已开 · 东侧通道畅通';
    if(id==='valve' && state.used) hint=state.cooling?'阀区冷却 '+Math.ceil(state.cooling)+'s':'阀区冷却已结束';
    if(id==='gate' && state.jumpCd>0) hint='相位锚冷却 '+Math.ceil(state.jumpCd)+'s';
    h.hidden=false;putText(h,hint);
    b.hidden=nearPad()<0 || state.used || state.jumpCd>0 || (id==='gate'&&G.phase==='clear');
    if(!b.hidden) putText(b,'R  '+label);
  }
  function drawPad(p, spec) {
    const x=SX(p.x),y=SY(p.y);
    if(x< -70||x>VW+70||y< -48||y>VH+54) return;
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=spec.color;ctx.lineWidth=1.5;
    ctx.fillStyle='#172a30';ctx.beginPath();ctx.ellipse(0,0,18,8,0,0,TAU);ctx.fill();ctx.stroke();
    if(spec.id==='tower'){
      ctx.beginPath();ctx.moveTo(-7,-2);ctx.lineTo(0,-24);ctx.lineTo(7,-2);ctx.stroke();
      ctx.fillStyle=spec.color;ctx.fillRect(-2,-26,4,5);
    } else if(spec.id==='gate') {
      ctx.beginPath();ctx.ellipse(0,-9,10,17,0,0,TAU);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-4,-11);ctx.lineTo(3,-9);ctx.lineTo(-4,-5);ctx.stroke();
    } else {
      ctx.fillStyle='#456266';ctx.fillRect(-6,-12,12,11);
      ctx.beginPath();ctx.ellipse(0,-14,8,4,0,0,TAU);ctx.moveTo(-7,-14);ctx.lineTo(7,-14);ctx.stroke();
    }
    ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.lineWidth=2.7;ctx.strokeStyle='#0d1720';
    ctx.strokeText(spec.name,0,-28);ctx.fillStyle=spec.color;ctx.fillText(spec.name,0,-28);ctx.restore();
  }
  function drawStations() {
    if(!state?.spec) return;
    const spec=state.spec, activeRadius=spec.id==='heater'&&state.used?135:state.cooling>0?146:0;
    if(activeRadius){
      const p=state.pads[0];ctx.save();ctx.strokeStyle=spec.color;ctx.globalAlpha=.55;ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(SX(p.x),SY(p.y),activeRadius,activeRadius*KZ,0,0,TAU);ctx.stroke();ctx.restore();
    }
    for(const p of state.pads) drawPad(p,spec);
  }
  function drawWarning(g) {
    const s=state?.strike;if(!s || FieldMaps.underground())return;
    const color=s.friendly?'#86ffe0':'#ff955d';
    if(!s.fired){drawHazardCircle(g,s.x,s.y,s.r,color,Math.min(s.t/s.wind,1));return;}
    const x=SX(s.x),y=SY(s.y);
    g.save();g.strokeStyle=color;g.lineWidth=3;g.globalAlpha=1-(s.t-s.wind)/.28;
    g.beginPath();g.moveTo(x+9,y-86);g.lineTo(x-7,y-37);g.lineTo(x+4,y-40);g.lineTo(x,y);g.stroke();g.restore();
  }
  return {begin,particles,prepareProps,activate,frostFactor,tick,skyLabel,tintFloor,paintHud,drawStations,drawWarning,mapMarkers,guideMarker,routeNotes};
})();
