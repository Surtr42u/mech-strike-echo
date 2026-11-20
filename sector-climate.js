/* Outdoor conditions, surface hazards, field support and one usable installation in each of sectors 02–05. */
const SectorClimate = (() => {
  const skies = {
    clear:{name:'晴', particles:null}, dust:{name:'尘暴', particles:0},
    rain:{name:'阵雨', particles:1}, storm:{name:'雷雨', particles:1},
    snow:{name:'小雪', particles:2}, blizzard:{name:'暴雪', particles:2}
  };
  const forecasts = [
    null, ['rain','storm','clear','storm'], ['snow','blizzard','clear','snow']
  ];
  const installations = [
    null,
    {id:'tower', name:'引雷塔', verb:'接通引雷塔', color:'#88e9ee', points:[[.56,.48]]},
    {id:'heater', name:'地热阀', verb:'打开地热阀', color:'#ffd48a', points:[[.57,.51]]},
    {id:'valve', name:'冷却阀', verb:'释放冷却液', color:'#83e3c6', points:[[.51,.46]]},
    {id:'gate', name:'相位锚', verb:'相位跃迁', color:'#c4acff', points:[[.45,.54],[.75,.29]]}
  ];
  const weatherPeriod=26, dayPeriod=104, gateCooldown=9, shelterRadius=106;
  /* 沙暴侵蚀 / 支援信标 / 地图机关常量 */
  const stormShelterRadius=86, stormInterval=1, supportHold=3.5, supportArm=18, supportRadius=48;
  const supportKinds=[
    {kind:'turret',label:'哨戒炮塔',color:'#7fe7d2'},
    {kind:'strike',label:'定向炮击',color:'#ffc06e'}
  ];
  const lavaSpots=[
    [.14,.18],[.86,.18],[.14,.82],[.86,.82],[.08,.50],[.92,.50],
    [.50,.08],[.50,.92],[.32,.30],[.68,.30],[.32,.70],[.68,.70]
  ];
  const daylightPalette=Array.from({length:33},(_,i)=>{
    const f=i/32;
    return 'rgb('+Math.round(21+204*f)+','+Math.round(43+113*f)+','+Math.round(88+9*f)+')';
  });
  const noMarkers=Object.freeze([]);
  let state;

  function begin(stage) {
    const spec=installations[stage];
    const pads=spec ? Object.freeze(spec.points.map(([x,y])=>Object.freeze({
      x:Math.round(ARENA.w*x),y:Math.round(ARENA.h*y),name:spec.name,color:spec.color
    }))) : noMarkers;
    /* 本图机关：塔=雷击，阀=熔岩水位，锚=虚空塌陷。 */
    const facility=!spec?null:spec.id==='tower'?{timer:6,last:null,calibrated:false}:
      spec.id==='gate'?{timer:10,last:null,grace:0,calibrated:false}:null;
    const lava=spec?.id==='valve'?{level:0,next:20,cd:0,used:new Set(),placed:[]}:null;
    state={stage, elapsed:0, sky:stage===0?'dust':forecasts[stage]?.[0] || null, spec, pads,
      used:false, charges:0, cooling:0, jumpCd:0, strike:null, nextStrike:4,
      support:{phase:'idle',armT:0,cd:0,cdMax:0,ready:-1,armed:-1,beacons:null,charge:[],markers:null},
      facility, lava};
  }

  function clearDust(){
    state.sky='clear';
    G.env=buildEnv(state.stage);
  }

  function towerOn(){ return typeof TOWER!=='undefined' && TOWER.active(); }
  function under(){ return typeof FieldMaps!=='undefined' && typeof FieldMaps.underground==='function' && FieldMaps.underground(); }
  function hasStormApi(){ return typeof FieldMaps!=='undefined' && typeof FieldMaps.stormActive==='function'; }
  /* 主代理可能稍后才补 FieldMaps.stormActive；不存在时按“无沙暴”处理。 */
  function stormOn(){ return !towerOn() && hasStormApi() && !!FieldMaps.stormActive(); }

  function mineOpen(){ return state?.spec?.id==='heater' && state.used; }

  function mapMarkers(){
    if(FieldMaps.underground()) return noMarkers;
    if(!state) return noMarkers;
    const pads=surfaceShelters();
    if(!state.support.beacons) return pads;
    if(!state.support.markers){
      const extra=[];
      for(const b of state.support.beacons){
        if(pads.some(p=>d2(p.x,p.y,b.x,b.y)<10**2)) continue;
        extra.push(Object.freeze({x:b.x,y:b.y,name:'支援信标',color:b.color,support:true}));
      }
      state.support.markers=extra.length?Object.freeze(pads.concat(extra)):pads;
    }
    return state.support.markers;
  }

  function guideMarker(){
    if(!G.p || G.phase==='clear' || state?.used || state?.jumpCd>0) return null;
    let nearest=null, distance=Infinity;
    for(const pad of mapMarkers()){
      if(pad.support) continue;
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
    /* 异常必须在地面/补给点/刷怪锚点烘焙前掷出，残骸掩体才能参与生成。 */
    if(typeof StageEvents!=='undefined') StageEvents.prepare(state.stage);
    if(typeof StageEvents!=='undefined' && StageEvents.anomalyId()==='wreck') addWreckCover();
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

  /* 装甲残骸：战区边缘补 6 处实体残骸，参与碰撞、补给点与刷怪锚点。 */
  function addWreckCover() {
    const cx=ARENA.w/2, cy=ARENA.h/2;
    let placed=0, guard=160;
    while(placed<6 && guard-->0){
      const a=Math.random()*TAU, r=185+Math.random()*245;
      const x=clamp(cx+Math.cos(a)*r,64,ARENA.w-64);
      const y=clamp(cy+Math.sin(a)*r*.82,74,ARENA.h-58);
      if(d2(x,y,cx,cy)<175**2) continue;
      let ok=true;
      for(const p of G.props){
        const gap=p.r+(p.lm?112:42);
        if(d2(x,y,p.x,p.y)<gap*gap){ ok=false; break; }
      }
      if(!ok) continue;
      for(const p of state.pads) if(d2(x,y,p.x,p.y)<82**2){ ok=false; break; }
      if(!ok) continue;
      G.props.push({kind:'crate',x,y,r:19+Math.random()*8,h:34+Math.random()*18,
        seed:Math.random()*100,solid:true,grp:-2,lift:0,anomaly:true});
      placed++;
    }
  }

  function nearPad() {
    if(!state?.spec || G.mode!=='play' || FieldMaps.underground() || !G.p) return -1;
    return state.pads.findIndex(s=>d2(G.p.x,G.p.y,s.x,s.y)<44**2);
  }

  function activate() {
    const pad=nearPad();
    if(pad<0) return false;
    const spec=state.spec;
    if(spec.id==='gate'){
      if(state.jumpCd>0) return false;
      const dest=state.pads[1-pad];
      spark(G.p.x,G.p.y,8,spec.color,80);
      G.p.x=dest.x;G.p.y=dest.y;G.p.vx=0;G.p.vy=0;
      G.p.inv=Math.max(G.p.inv,.35);state.jumpCd=gateCooldown;
      spark(dest.x,dest.y,8,spec.color,80);
      if(state.facility){
        state.facility.calibrated=true;state.facility.grace=20;
        clearFacilityZones('void');
      }
      banner('相位跃迁','双锚冷却 9 秒 · 虚空塌陷暂停',1);
    } else {
      if(state.used) return false;
      state.used=true;
      if(spec.id==='tower'){
        state.charges=3;state.nextStrike=.25;
        if(state.strike && !state.strike.fired) state.strike=null;
        clearFacilityZones('thunder');
        banner('引雷塔已接通','接下来三道落雷追踪敌群 · 雷暴停止劈向驾驶员',1.4);
      } else if(spec.id==='heater'){
        G.props=G.props.filter(p=>!p.iceSeal);
        G.spawnAnchors=buildSpawnAnchors(SCENES[G.stage]);
        banner('地热阀已开启','冰墙融开 · 冻晶矿井升降台可用',1.6);
      } else if(spec.id==='valve'){
        state.cooling=10;purgePools();resetLava();
        banner('冷却阀泄压','十秒内阀区持续清除熔池、减速敌人 · 熔岩水位归零',1.6);
      }
    }
    if(!TOWER.active()) CampaignStory.complete();
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
    let f=1;
    if(state && state.sky==='blizzard' && !unit.fly && !FieldMaps.underground()){
      const heater=state.pads[0];
      if(!(state.used && heater && d2(unit.x,unit.y,heater.x,heater.y)<135**2)) f=.88;
    }
    /* 虚空潮汐只加速敌人；玩家走 currentMoveSpeed，同样会调用到这里。 */
    if(unit && unit!==G.p && typeof StageEvents!=='undefined') f*=StageEvents.enemySpeedMul();
    return f;
  }

  /* ── 沙暴侵蚀 ──
     主代理读取 surfaceHazard() 自行结算伤害；这里只判定“地表且不在庇护点”。
     vision 为能见度系数：1 正常，越低越模糊（主代理可选用）。 */
  function stormDamage(){ return Math.min(3,2+Math.floor((G.stage||0)/2)); }
  /* 第一区没有气候机关，借用既有地表补给投放点补两处防沙掩体；
     其余战区仍直接用 state.pads（气候补给点）。 */
  function surfaceShelters(){
    if(!state) return noMarkers;
    if(towerOn()) return noMarkers;
    if(state.spec || state.pads.length) return state.pads;
    if(!Array.isArray(G.supplyPads) || !G.supplyPads.length) return noMarkers;
    let a=null,b=null,best=-1;
    for(let i=0;i<G.supplyPads.length;i++) for(let j=i+1;j<G.supplyPads.length;j++){
      const d=d2(G.supplyPads[i].x,G.supplyPads[i].y,G.supplyPads[j].x,G.supplyPads[j].y);
      if(d>best){best=d;a=G.supplyPads[i];b=G.supplyPads[j];}
    }
    if(!a) a=G.supplyPads[0];
    const picks=a&&b?[a,b]:a?[a]:[];
    state.pads=Object.freeze(picks.map(p=>Object.freeze({
      x:p.x,y:p.y,name:'防沙掩体',color:'#ffd59a'
    })));
    return state.pads;
  }
  function sheltered(){
    if(!state || !G.p) return false;
    const pads=surfaceShelters();
    if(!pads.length) return false;
    for(const p of pads) if(d2(G.p.x,G.p.y,p.x,p.y)<stormShelterRadius**2) return true;
    return false;
  }
  function surfaceHazard(){
    if(!state) return {active:false,dps:0,interval:stormInterval,label:'沙暴',vision:1};
    const on=stormOn(), underNow=under(), shelter=on && !underNow && sheltered();
    const active=on && !underNow && !shelter && G.mode==='play' && !!G.p && G.p.hp>0;
    const dmg=on?stormDamage():0;
    return {active,dps:active?dmg/stormInterval:0,interval:stormInterval,label:'沙暴',
      vision:!on?1:underNow?1:shelter ? .82 : .55};
  }
  function stormStatus(){
    if(!state) return '';
    /* 地下时 stormActive() 为 false，但箱庭里仍要提示“地表还在刮”，避免玩家以为已经安全 */
    if(under()){
      return state.stage===0 && typeof FieldMaps.vented==='function' && !FieldMaps.vented() ?
        '地表沙暴持续 · 井下安全' : '';
    }
    if(!stormOn()) return '';
    const name=typeof StageEvents!=='undefined' && StageEvents.anomalyId()==='sand'?'地表沙暴':'沙暴';
    if(sheltered()) return name+' · 庇护中，暂不受侵蚀';
    return name+' · 每秒 '+stormDamage()+' 伤害 · 寻找庇护或下井';
  }

  /* ── 支援信标 ──
     优先取本图气候补给点；不足 2 个时用地表补给投放点补位。
     信标只负责状态与位置，炮塔/友方落区由主代理生成。 */
  function supportBeacons(){
    const s=state?.support;
    if(!s || towerOn()) return noMarkers;
    if(s.beacons) return s.beacons;
    if(under()) return noMarkers;
    const picks=[];
    const pads=surfaceShelters();
    if(pads.length>=2) picks.push(pads[0],pads[pads.length-1]);
    else if(pads.length===1) picks.push(pads[0]);
    if(picks.length<2 && Array.isArray(G.supplyPads)){
      const pool=G.supplyPads.filter(p=>p && picks.every(q=>d2(p.x,p.y,q.x,q.y)>60**2));
      while(picks.length<2 && pool.length){
        let best=-1,bestD=-1;
        for(let i=0;i<pool.length;i++){
          const p=pool[i];
          const d=picks.length?Math.min(...picks.map(q=>d2(p.x,p.y,q.x,q.y))):d2(p.x,p.y,ARENA.w/2,ARENA.h/2);
          if(d>bestD){bestD=d;best=i;}
        }
        if(best<0) break;
        picks.push(pool.splice(best,1)[0]);
      }
    }
    if(!picks.length && !pads.length && !Array.isArray(G.supplyPads)) return noMarkers;
    s.beacons=Object.freeze(picks.map((p,i)=>{
      const k=supportKinds[i%2];
      return Object.freeze({x:p.x,y:p.y,kind:k.kind,label:k.label,color:k.color});
    }));
    s.charge=s.beacons.map(()=>0);
    s.markers=null;
    return s.beacons;
  }

  function tickSupport(dt){
    const s=state.support;
    if(!s || towerOn()) return;
    if(s.cd>0){
      s.cd=Math.max(0,s.cd-dt);
      if(s.cd<=1e-6){s.cd=0;s.phase='idle';s.charge=s.charge.map(()=>0);}
      return;
    }
    if(s.phase==='arming'){
      s.armT=Math.max(0,s.armT-dt);
      if(s.armT<=1e-6){s.armT=0;s.phase='ready';s.ready=s.armed;s.armed=-1;}
      return;
    }
    if(s.phase==='ready' || under() || !G.p) return;
    const list=supportBeacons();
    if(!list.length) return;
    let idx=-1,best=supportRadius**2;
    for(let i=0;i<list.length;i++){
      const d=d2(G.p.x,G.p.y,list[i].x,list[i].y);
      if(d<=best){best=d;idx=i;}
    }
    if(idx<0) return;
    s.charge[idx]+=dt;
    if(s.charge[idx]>=supportHold){
      s.charge[idx]=supportHold;
      s.phase='arming';s.armed=idx;s.armT=supportArm;
    }
  }

  function supportStatus(){
    const s=state?.support;
    if(!s || towerOn()) return '';
    const list=supportBeacons();
    if(!list.length) return '';
    if(s.phase==='cooldown') return '支援冷却 '+Math.ceil(s.cd)+'s';
    if(s.phase==='arming') return '支援信标 · 呼叫中 '+Math.ceil(s.armT)+'s';
    if(s.phase==='ready'){
      const b=list[s.ready];
      return '支援已就绪'+(b?' · '+b.label:'')+(under()?' · 返回地表投放':'');
    }
    if(under() || !G.p) return '';
    let idx=-1,best=supportRadius**2;
    for(let i=0;i<list.length;i++){
      const d=d2(G.p.x,G.p.y,list[i].x,list[i].y);
      if(d<=best){best=d;idx=i;}
    }
    if(idx<0) return '';
    return '支援信标 · '+list[idx].label+' '+s.charge[idx].toFixed(1)+'/'+supportHold+'s';
  }

  function readySupport(){
    const s=state?.support;
    if(!s || towerOn() || under() || s.phase!=='ready' || s.ready<0) return null;
    const b=supportBeacons()[s.ready];
    return b?{x:b.x,y:b.y,kind:b.kind,label:b.label}:null;
  }

  function consumeSupport(){
    const out=readySupport();
    if(!out) return null;
    const s=state.support;
    s.phase='cooldown';s.ready=-1;s.armed=-1;
    s.cd=s.cdMax=45+Math.min(15,(G.stage||0)*3);
    s.charge=s.charge.map(()=>0);
    return out;
  }

  /* ── 地图机关异常 ──
     雷击/塌陷走现有 addZone 预警区；熔岩走 addPool 危险区。
     这里只排队与标记，伤害仍由 game.js 的 hazard 结算。 */
  function clearFacilityZones(kind){
    if(!Array.isArray(G.haz)) return;
    for(let i=G.haz.length-1;i>=0;i--) if(G.haz[i].facKind===kind) G.haz.splice(i,1);
  }
  function addFacilityZone(kind,x,y,r,dmg,delay){
    if(typeof addZone!=='function') return;
    addZone(x,y,r,dmg,delay);
    const h=G.haz[G.haz.length-1];
    if(h && h.kind==='zone'){h.facKind=kind;h.col=kind==='thunder'?'#a9e4ff':'#d4b0ff';}
  }
  function lightningPoint(){
    const f=state.facility;
    let best=null, bestD=-1;
    for(let i=0;i<10;i++){
      const a=Math.random()*TAU, r=48+Math.random()*78;
      const x=clamp(G.p.x+Math.cos(a)*r,42,ARENA.w-42);
      const y=clamp(G.p.y+Math.sin(a)*r*.8,48,ARENA.h-48);
      const d=f.last?d2(x,y,f.last.x,f.last.y):Infinity;
      if(d>bestD){bestD=d;best={x,y};}
      if(d>=88**2) break;
    }
    let {x,y}=best || {x:G.p.x,y:G.p.y};
    if(f.last && d2(x,y,f.last.x,f.last.y)<70**2){
      const a=Math.atan2(G.p.y-f.last.y,G.p.x-f.last.x);
      x=clamp(G.p.x+Math.cos(a)*100,42,ARENA.w-42);
      y=clamp(G.p.y+Math.sin(a)*100*.8,48,ARENA.h-48);
    }
    f.last={x,y};
    return {x,y};
  }

  function clearLavaPools(){
    if(!Array.isArray(G.haz)) return;
    for(let i=G.haz.length-1;i>=0;i--) if(G.haz[i].lava) G.haz.splice(i,1);
  }
  function lavaSpot(){
    const L=state.lava;
    for(let i=0;i<lavaSpots.length;i++){
      if(L.used.has(i)) continue;
      const [fx,fy]=lavaSpots[i];
      const x=clamp(ARENA.w*fx,58,ARENA.w-58);
      const y=clamp(ARENA.h*fy,68,ARENA.h-58);
      if(G.p && d2(x,y,G.p.x,G.p.y)<150**2) continue;
      if(state.pads.some(s=>d2(x,y,s.x,s.y)<140**2)) continue;
      if((G.supplyPads||[]).some(s=>d2(x,y,s.x,s.y)<110**2)) continue;
      if((G.props||[]).some(p=>p.solid && d2(x,y,p.x,p.y)<(p.r+54)**2)) continue;
      if(L.placed.some(q=>d2(x,y,q.x,q.y)<105**2)) continue;
      return {i,x,y};
    }
    return null;
  }
  function growLava(){
    const L=state.lava;
    if(typeof addPool!=='function') return;
    for(let n=0;n<2;n++){
      const spot=lavaSpot();
      if(!spot) break;
      L.used.add(spot.i);L.placed.push({x:spot.x,y:spot.y});
      addPool(spot.x,spot.y,50,9+(G.stage||0),1e4,'rgba(255,120,50,.55)');
      const h=G.haz[G.haz.length-1];
      if(h){h.lava=true;h.facility=true;}
    }
  }
  function resetLava(){
    const L=state?.lava;
    if(!L) return;
    clearLavaPools();
    L.level=0;L.cd=10;L.next=20;L.used.clear();L.placed.length=0;
  }
  function lavaTick(dt){
    const L=state.lava;
    if(!L) return;
    if(L.cd>0){
      L.cd=Math.max(0,L.cd-dt);
      clearLavaPools();
      if(L.cd<=1e-6){L.cd=0;L.level=1;L.next=20;growLava();}
      return;
    }
    if(L.level>=3) return;
    L.next-=dt;
    if(L.next<=0){L.level++;L.next=20;growLava();}
  }

  function facilityTick(dt){
    const spec=state?.spec;
    if(!spec || towerOn()) return;
    if(spec.id==='valve'){lavaTick(dt);return;}
    if(under()) return;
    const f=state.facility;
    if(!f) return;
    if(spec.id==='tower' && !state.used){
      f.timer-=dt;
      if(f.timer<=0){
        f.timer=5.6+Math.random()*.8;
        const p=lightningPoint();
        addFacilityZone('thunder',p.x,p.y,46,16,1.6);
        if(typeof G.shake==='number') G.shake=Math.max(G.shake,2.2);
      }
    } else if(spec.id==='gate' && !f.calibrated){
      if(f.grace>0){f.grace=Math.max(0,f.grace-dt);return;}
      f.timer-=dt;
      if(f.timer<=0){
        f.timer=9.4+Math.random()*1.2;
        const x=clamp(G.p.x,42,ARENA.w-42), y=clamp(G.p.y,48,ARENA.h-48);
        f.last={x,y};
        addFacilityZone('void',x,y,52,20,2);
        if(typeof G.shake==='number') G.shake=Math.max(G.shake,3);
      }
    }
  }

  function facilityStatus(){
    const spec=state?.spec;
    if(!spec || towerOn()) return '';
    if(spec.id==='tower') return state.used?'':'雷暴 · 寻找引雷塔';
    if(spec.id==='gate') return state.facility?.calibrated?'':'虚空塌陷 · 校准相位锚';
    if(spec.id==='valve'){
      const L=state.lava;
      if(!L) return '';
      if(L.cd>0) return '熔岩水位 0/3 · 冷却中 '+Math.ceil(L.cd)+'s';
      const action=state.used?'阀门已泄压':'开启冷却阀';
      return '熔岩水位 '+L.level+'/3 · '+action;
    }
    return '';
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
    } else if(state.spec?.id==='tower' && state.used){
      const tower=state.pads[0];
      if(d2(tower.x,tower.y,G.p.x,G.p.y)<=shelterRadius**2){
        target={x:tower.x,y:tower.y+(G.p.y>=tower.y?-168:168)};
      }
    }
    state.strike={x:target.x,y:target.y,r:friendly?64:42,t:0,wind:1.35,friendly,fired:false};
  }

  function resolveStrike(s) {
    const damage=s.friendly?58+G.stage*9:23+G.stage*4;
    const hit=s.friendly ? undefined : {source:'weather'};
    for(const e of G.enemies){
      if(e.dead || e.spawnT>0 || d2(s.x,s.y,e.x,e.y)>(s.r+e.r)**2) continue;
      applyDamage(e,damage,false,e.x,e.y-5,hit);
      if(s.friendly) e.stun=Math.max(e.stun||0,.8);
    }
    const boss=G.boss;
    if(boss && !boss.dead && d2(boss.x,boss.y,s.x,s.y)<=(s.r+boss.r)**2) damageBoss(boss,damage,false,boss.x,boss.y,hit);
    if(!s.friendly){
      const radius=playerRadius();
      if(d2(G.p.x,G.p.y,s.x,s.y)<=(s.r+radius)**2) hurtPlayer(9+2*G.stage);
    }
    spark(s.x,s.y,7,s.friendly?'#9ae9da':'#ffe299',95);
    G.rings.push({x:s.x,y:s.y,r:2,max:s.r,life:.27,maxLife:.27,col:s.friendly?'#9ae9da':'#ffb472',w:2});
  }

  function tick(dt) {
    if(!state || G.mode!=='play') return;
    state.elapsed+=dt;state.jumpCd=Math.max(0,state.jumpCd-dt);
    tickSupport(dt);facilityTick(dt);
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

  function drawWastelandWeather(g){
    if(FieldMaps.underground()) return;
    const sand=typeof StageEvents!=='undefined' && StageEvents.anomalyId()==='sand';
    const storm=stormOn();
    if(state?.stage!==0 && !sand && !storm) return;
    g.save();
    if(state?.stage===0){
      if(state.sky==='clear'){
        const daylight=g.createLinearGradient(SW*.8,0,SW*.35,SH);
        daylight.addColorStop(0,'rgba(255,221,161,.25)');
        daylight.addColorStop(.68,'rgba(255,221,161,0)');
        g.globalCompositeOperation='screen';g.fillStyle=daylight;g.fillRect(0,0,SW,SH);
      } else if(!hasStormApi() || storm){
        const x=SW*.5, y=SH*.53, inset=Math.min(SW,SH)*.27, radius=Math.hypot(SW/2,SH/2);
        const haze=g.createRadialGradient(x,y,inset,x,y,radius);
        haze.addColorStop(0,'rgba(128,98,83,.22)');
        haze.addColorStop(.58,'rgba(124,99,85,.48)');
        haze.addColorStop(1,'rgba(77,57,54,.77)');
        g.fillStyle=haze;g.fillRect(0,0,SW,SH);
        const clouds=g.createLinearGradient(0,0,0,SH*.45);
        clouds.addColorStop(0,'rgba(156,132,113,.42)');
        clouds.addColorStop(1,'rgba(156,132,113,0)');
        g.fillStyle=clouds;g.fillRect(0,0,SW,SH*.45);
        if(!reducedEffects){
          g.strokeStyle='#ffc17f';g.lineWidth=1.25;
          for(let i=0;i<32;i++){
            const px=(i*143+G.t*(84+i%3*15))%(SW+95)-80;
            const py=(i*43+G.t*9)%SH;
            g.globalAlpha=.12+(i%5)*.04;
            g.beginPath();g.moveTo(px,py);g.lineTo(px+16+i%6*5,py+4);g.stroke();
          }
        }
      }
    }
    /* 沙暴异常与沙暴侵蚀同场时只保留侵蚀视觉，避免双层沙雾把画面压成全黑 */
    if(sand && !storm) drawSandAnomaly(g);
    if(storm) drawStormHazard(g);
    g.restore();
  }

  /* 沙暴异常：暖色沙雾压低能见度，横向流沙只在低特效档关闭。 */
  function drawSandAnomaly(g){
    g.globalCompositeOperation='source-over';g.globalAlpha=1;
    const haze=g.createRadialGradient(SW*.5,SH*.48,Math.min(SW,SH)*.18,
      SW*.5,SH*.48,Math.hypot(SW,SH)*.56);
    haze.addColorStop(0,'rgba(206,165,100,.06)');
    haze.addColorStop(.58,'rgba(198,152,92,.18)');
    haze.addColorStop(1,'rgba(96,68,38,.40)');
    g.fillStyle=haze;g.fillRect(0,0,SW,SH);
    if(reducedEffects) return;
    g.strokeStyle='#e8c58a';g.lineWidth=1.2;
    for(let i=0;i<28;i++){
      const px=(i*97+G.t*(72+i%4*17))%(SW+110)-55;
      const py=(i*61+G.t*12)%SH;
      g.globalAlpha=.07+(i%4)*.025;
      g.beginPath();g.moveTo(px,py);g.lineTo(px+18+i%5*7,py+2);g.stroke();
    }
    g.globalAlpha=1;
  }

  /* 沙暴侵蚀视觉：整体沙雾 + 驾驶员附近更清晰的“视野隧道”，边缘压暗。
     低特效档关闭风向尘线，但保留压暗，保证危险信息仍然清晰。 */
  function drawStormHazard(g){
    if(FieldMaps.underground()) return;
    const shelter=sheltered();
    const ps=typeof playerScreenCSS==='function'?playerScreenCSS():{x:SW/2,y:SH/2};
    const min=Math.min(SW,SH), far=Math.max(ps.x,SW-ps.x,ps.y,SH-ps.y)*1.08;
    g.save();g.globalCompositeOperation='source-over';
    g.fillStyle='rgba(122,86,54,'+(shelter ? .05 : .09)+')';
    g.fillRect(0,0,SW,SH);
    const inner=min*(shelter ? .255 : .15), edge=shelter ? .24 : .36;
    const dark=g.createRadialGradient(ps.x,ps.y,inner,ps.x,ps.y,Math.max(far,min*.52));
    dark.addColorStop(0,'rgba(35,22,14,0)');
    dark.addColorStop(.55,'rgba(35,22,14,'+(edge*.24).toFixed(3)+')');
    dark.addColorStop(1,'rgba(22,13,8,'+edge.toFixed(3)+')');
    g.fillStyle=dark;g.fillRect(0,0,SW,SH);
    if(!reducedEffects){
      const count=shelter?10:30;
      g.strokeStyle='#f0cf9c';g.lineWidth=1.15;
      for(let i=0;i<count;i++){
        const px=(i*137+G.t*(210+i%4*26))%(SW+190)-95;
        const py=(i*67+G.t*(18+i%3*7))%SH;
        g.globalAlpha=(shelter ? .05 : .09)+(i%5)*.03;
        g.beginPath();g.moveTo(px,py);g.lineTo(px+24+i%6*7,py-3-i%3*2);g.stroke();
      }
      g.globalAlpha=1;
    }
    g.restore();
  }

  /* 支援信标：地面环 + 进度环 + 呼叫/就绪倒计时。 */
  function drawSupportMarkers(g){
    const s=state?.support;
    if(!s || towerOn() || G.mode!=='play' || under()) return;
    const list=supportBeacons();
    if(!list.length) return;
    const cooling=s.phase==='cooldown';
    for(let i=0;i<list.length;i++){
      const b=list[i], x=SX(b.x), y=SY(b.y);
      if(x<-60||x>VW+60||y<-50||y>VH+60) continue;
      let prog=0, text='', hot=false;
      if(cooling){
        prog=1-Math.max(0,s.cd)/Math.max(1,s.cdMax);
        text='冷却 '+Math.ceil(s.cd)+'s';
      } else if(s.phase==='arming' && s.armed===i){
        prog=1-s.armT/supportArm;
        text='呼叫 '+Math.ceil(s.armT)+'s';
      } else if(s.phase==='ready' && s.ready===i){
        prog=1;text='就绪';hot=true;
      } else {
        const charge=s.charge[i]||0;
        prog=clamp(charge/supportHold,0,1);
        text=charge>0?charge.toFixed(1)+'/'+supportHold+'s':'待机';
      }
      g.save();g.translate(x,y);
      const col=b.color;
      g.fillStyle='rgba(16,30,34,.72)';
      g.beginPath();g.ellipse(0,0,17,17*KZ,0,0,TAU);g.fill();
      g.strokeStyle=col;g.lineWidth=1.5;g.globalAlpha=.9;
      g.beginPath();g.ellipse(0,0,17,17*KZ,0,0,TAU);g.stroke();
      g.globalAlpha=.22;g.lineWidth=2.4;
      g.beginPath();g.ellipse(0,0,23,23*KZ,0,0,TAU);g.stroke();
      if(prog>0){
        g.globalAlpha=hot ? .95 : .8;
        g.beginPath();g.ellipse(0,0,23,23*KZ,0,-Math.PI/2,-Math.PI/2+TAU*prog);g.stroke();
      }
      g.globalAlpha=1;g.strokeStyle=col;g.lineWidth=1.6;
      g.beginPath();g.moveTo(0,0);g.lineTo(0,-13);g.stroke();
      g.fillStyle=hot?'#fff4c8':col;
      g.beginPath();g.moveTo(0,-19);g.lineTo(4.5,-13);g.lineTo(0,-7);g.lineTo(-4.5,-13);g.closePath();g.fill();
      if(hot){
        g.globalAlpha=.35+.35*Math.sin(G.t*5);
        g.beginPath();g.ellipse(0,0,30,30*KZ,0,0,TAU);g.stroke();
      }
      g.globalAlpha=1;g.font='bold 8px sans-serif';g.textAlign='center';
      g.lineWidth=2.7;g.strokeStyle='#0d1720';
      g.strokeText(b.label,0,30);g.fillStyle=col;g.fillText(b.label,0,30);
      if(text){
        g.font='bold 7px sans-serif';g.lineWidth=2.4;
        g.strokeText(text,0,39);g.fillStyle=hot?'#fff1b8':'#e8ddc4';g.fillText(text,0,39);
      }
      g.restore();
    }
  }

  /* 雷击/虚空塌陷的区域配色提示，与 game.js 的红色预警区叠加。 */
  function drawFacilityWarnings(g){
    if(G.mode!=='play' || !state || under() || !Array.isArray(G.haz)) return;
    for(const h of G.haz){
      if(h.kind!=='zone' || !h.facKind) continue;
      const x=SX(h.x), y=SY(h.y);
      if(x<-50||x>VW+50||y<-40||y>VH+50) continue;
      const col=h.facKind==='thunder'?'#a9e4ff':'#d4b0ff';
      const left=Math.max(0,h.life);
      g.save();g.strokeStyle=col;g.lineWidth=1.5;g.globalAlpha=.6;
      g.beginPath();g.ellipse(x,y,h.r+5,(h.r+5)*KZ,0,0,TAU);g.stroke();
      g.globalAlpha=.95;g.font='bold 8px sans-serif';g.textAlign='center';
      g.lineWidth=2.7;g.strokeStyle='#0d1720';
      const label=(h.facKind==='thunder'?'雷击 ':'塌陷 ')+left.toFixed(1)+'s';
      g.strokeText(label,x,y-14);g.fillStyle=col;g.fillText(label,x,y-14);g.restore();
    }
  }

  /* 第一区没有机关图层，沙暴庇护环在这里补画。 */
  function drawShelters(g){
    if(G.mode!=='play' || !stormOn() || under()) return;
    const pads=surfaceShelters();
    if(!pads.length) return;
    g.save();g.strokeStyle='#ffd59a';g.lineWidth=1.4;g.setLineDash([6,7]);
    for(const p of pads){
      const x=SX(p.x), y=SY(p.y);
      if(x<-120||x>VW+120||y<-100||y>VH+100) continue;
      g.globalAlpha=.16+.09*(.5+.5*Math.sin(G.t*2+p.x*.01));
      g.beginPath();g.ellipse(x,y,stormShelterRadius,stormShelterRadius*KZ,0,0,TAU);g.stroke();
    }
    g.restore();
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
    if(id==='tower' && state.used) hint=state.charges?'引雷剩余 '+state.charges+' 次':'避雷棚已接地';
    if(id==='heater' && state.used) hint='地热已开 · 东侧通道畅通';
    if(id==='valve' && state.used) hint=state.cooling?'阀区冷却 '+Math.ceil(state.cooling)+'s':'冷却中继已接通';
    if(id==='gate' && state.jumpCd>0) hint='相位锚冷却 '+Math.ceil(state.jumpCd)+'s';
    const route=CampaignStory.approachRoute();
    if(route) hint=CampaignStory.repaired()?route:route+' · 或'+label;
    /* 主代理已在终端 HUD 加独立 hazard 行时不再重复；没有该行时退回目标栏。 */
    const dedicated=typeof byId==='function' && byId('hudHazard');
    const tags=dedicated?[]:[stormStatus(),facilityStatus(),supportStatus()].filter(Boolean);
    if(tags.length) hint+=' ｜ '+tags.join(' ｜ ');
    h.hidden=false;putText(h,hint);
    b.hidden=nearPad()<0 || state.used || state.jumpCd>0;
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
    const name=spec.id==='tower'&&state.used?'避雷棚 · 已接地':spec.name;
    ctx.strokeText(name,0,-28);ctx.fillStyle=spec.color;ctx.fillText(name,0,-28);ctx.restore();
  }
  function drawStations() {
    if(!state?.spec) return;
    const spec=state.spec;
    if(stormOn() && !under() && state.pads.length){
      ctx.save();ctx.strokeStyle='#ffd59a';ctx.lineWidth=1.4;ctx.setLineDash([6,7]);
      for(const p of state.pads){
        ctx.globalAlpha=.16+.09*(.5+.5*Math.sin(G.t*2+p.x*.01));
        ctx.beginPath();ctx.ellipse(SX(p.x),SY(p.y),stormShelterRadius,stormShelterRadius*KZ,0,0,TAU);ctx.stroke();
      }
      ctx.restore();
    }
    const activeRadius=spec.id==='tower'&&state.used?shelterRadius:spec.id==='heater'&&state.used?135:state.cooling>0?146:0;
    if(activeRadius){
      const p=state.pads[0];ctx.save();ctx.strokeStyle=ctx.fillStyle=spec.color;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(SX(p.x),SY(p.y),activeRadius,activeRadius*KZ,0,0,TAU);
      ctx.globalAlpha=.1;ctx.fill();ctx.globalAlpha=.63;ctx.stroke();ctx.restore();
    }
    for(const p of state.pads) drawPad(p,spec);
  }
  function drawWarning(g) {
    if(!state?.spec) drawShelters(g);
    drawSupportMarkers(g);
    drawFacilityWarnings(g);
    const s=state?.strike;if(!s || FieldMaps.underground())return;
    const color=s.friendly?'#86ffe0':'#ff955d';
    if(!s.fired){drawHazardCircle(g,s.x,s.y,s.r,color,Math.min(s.t/s.wind,1));return;}
    const x=SX(s.x),y=SY(s.y);
    g.save();g.strokeStyle=color;g.lineWidth=3;g.globalAlpha=1-(s.t-s.wind)/.28;
    g.beginPath();g.moveTo(x+9,y-86);g.lineTo(x-7,y-37);g.lineTo(x+4,y-40);g.lineTo(x,y);g.stroke();g.restore();
  }
  return {begin,clearDust,mineOpen,particles,prepareProps,activate,frostFactor,tick,skyLabel,tintFloor,drawWastelandWeather,
    paintHud,drawStations,drawWarning,mapMarkers,guideMarker,
    surfaceHazard,stormStatus,supportStatus,readySupport,consumeSupport,facilityStatus};
})();
