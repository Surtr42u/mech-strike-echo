/* The lift changes the active floor. Both layouts share one combat clock and enemy budget. */
const FieldMaps = (() => {
  const source = {
    lift:{x:618,y:398}, breaker:{x:522,y:348}, relay:{x:752,y:226}
  };
  const railLayout = [
    {x:294,y:165,w:28,h:222}, {x:294,y:363,w:206,h:24},
    {x:432,y:202,w:204,h:24}, {x:610,y:204,w:26,h:106},
    {x:672,y:325,w:27,h:204}, {x:500,y:500,w:175,h:24},
    {x:773,y:386,w:138,h:25}, {x:206,y:497,w:138,h:23}
  ];
  const step = 32;
  let lift, breaker, relay, rails, cols, rows;
  const point = (x,y) => ({x:x*ARENA.w/1040, y:y*ARENA.h/720});
  const offsets = [[1,0],[-1,0],[0,1],[0,-1]];
  const images = {};
  let field = null;

  async function load() {
    const embedded = document.getElementById('fieldArt');
    const files = embedded ? JSON.parse(embedded.textContent) : {};
    await Promise.all(['surface-ground','underground-floor'].map(async key => {
      const name = key + '.webp';
      try { images[key] = await loadImage(files[name] || 'assets/' + name); }
      catch { images[key] = null; }
    }));
    byId('fieldInteract').addEventListener('click',interact);
    byId('fieldMapButton').addEventListener('click',openMap);
    byId('fieldMapDialog').addEventListener('close',closeMap);
    window.addEventListener('keydown',event => {
      if(event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if(event.code === 'KeyR' && interact()) event.preventDefault();
      if(event.code === 'KeyM'){
        if(byId('fieldMapDialog').open){ byId('fieldMapDialog').close(); event.preventDefault(); }
        else if(openMap()) event.preventDefault();
      }
    });
  }

  function begin(stage) {
    field = stage === 0 ? {inside:false,power:false,vent:false,surface:null,tunnel:null,nav:null,target:-1,liftReady:0} : null;
    lift = point(source.lift.x,source.lift.y);
    breaker = point(source.breaker.x,source.breaker.y);
    relay = point(source.relay.x,source.relay.y);
    rails = railLayout.map(({x,y,w,h})=>({...point(x,y),w:w*ARENA.w/1040,h:h*ARENA.h/720}));
    cols = Math.ceil(ARENA.w/step);
    rows = Math.ceil(ARENA.h/step);
    byId('fieldInteract').hidden = true;
  }

  function texture(g,key,alpha) {
    if(!images[key]) return;
    g.save();
    g.globalAlpha = alpha;
    g.scale(.58,.58);
    g.fillStyle = g.createPattern(images[key],'repeat');
    g.fillRect(0,0,ARENA.w/.58,ARENA.h/.58);
    g.restore();
  }

  function prepareSurface() {
    if(!field) return;
    texture(G.ground.getContext('2d'),'surface-ground',.44);
    G.props = G.props.filter(p => p.lm || [lift,breaker].every(s => Math.hypot(p.x-s.x,p.y-s.y) > p.r+48));
    field.surface = {ground:G.ground,marks:G.groundMarks,props:G.props,pads:G.supplyPads,anchors:G.spawnAnchors};
  }

  function buildTunnel() {
    const floor = document.createElement('canvas');
    floor.width = ARENA.w; floor.height = ARENA.h;
    const g = floor.getContext('2d');
    g.fillStyle = '#233238'; g.fillRect(0,0,floor.width,floor.height);
    texture(g,'underground-floor',.87);
    g.fillStyle = '#12252942'; g.fillRect(0,0,floor.width,floor.height);
    for(const wall of rails) {
      const {x,y,w,h} = wall;
      g.fillStyle = '#121f22'; g.fillRect(x+5,y+6,w,h+4);
      g.fillStyle = '#25383d'; g.fillRect(x,y,w,h);
      g.fillStyle = '#465a5b'; g.fillRect(x,y-4,w,h-4);
      g.fillStyle = '#8da19b'; g.fillRect(x,y-4,w,2);
      g.fillStyle = '#c4a160';
      if(w>h) for(let i=8;i<w-7;i+=26) g.fillRect(x+i,y-1,9,3);
      else for(let i=8;i<h-7;i+=26) g.fillRect(x+3,y+i,3,9);
    }
    const marks = document.createElement('canvas');
    marks.width = ARENA.w; marks.height = ARENA.h;
    const m = marks.getContext('2d');
    // One worn guide cable leads from the lift through the lower switchback.
    m.strokeStyle='#c2a15eaa'; m.lineWidth=3; m.setLineDash([12,11]);
    m.beginPath(); m.moveTo(lift.x,lift.y);
    for(const [x,y] of [[645,398],[645,288],[748,288]]){ const p=point(x,y); m.lineTo(p.x,p.y); }
    m.lineTo(relay.x,relay.y); m.stroke();
    const pads = [point(490,425),point(759,295),point(376,455)];
    return {ground:floor,marks,props:[],pads,anchors:[]};
  }

  function setFloor(inside, exchange = true){
    if(inside && !field.tunnel) field.tunnel = buildTunnel();
    const layout = inside ? field.tunnel : field.surface;
    field.inside = inside;
    G.ground = layout.ground; G.groundMarks = layout.marks; G.props = layout.props;
    G.supplyPads = layout.pads; G.spawnAnchors = layout.anchors;
    G.scars.length = 0;
    G.bullets.length = G.eb.length = G.haz.length = 0;
    G.parts.length = G.rings.length = G.lightsFx.length = G.texts.length = 0;
    STAGE3D.invalidateGround();
    G.sceneFx = .32;
    clearRails(G.p,9);
    for(const crate of G.crates) clearRails(crate,18);
    if(exchange) reformWaveEnemies(floorId());
  }

  function returnForEncounter(){
    if(!underground()) return;
    setFloor(false,false);
    Object.assign(G.p,{x:lift.x,y:lift.y,vx:0,vy:0});
    Object.assign(G.cam,{x:lift.x,y:lift.y});
  }

  function underground() { return !!field && field.inside; }
  function floorId(){ return underground() ? 'underground' : 'surface'; }
  function stations(){
    return field ? {lift:{...lift},breaker:{...breaker},relay:{...relay}} : null;
  }
  function blocksMovement(x,y,r) {
    return underground() && rails.some(w =>
      x>w.x-r && x<w.x+w.w+r && y>w.y-r && y<w.y+w.h+r);
  }
  function openPoint(x,y,r){
    return !blocksMovement(x,y,r) &&
      !G.props.some(prop => prop.solid && d2(x,y,prop.x,prop.y) < (prop.r+r) ** 2);
  }

  function safePoint(x,y,r){
    for(let i=0;i<=8;i++){
      const radius=i*28;
      for(let k=0;k<8;k++){
        const angle=k*TAU/8;
        const px=clamp(x+Math.cos(angle)*radius,40,ARENA.w-40);
        const py=clamp(y+Math.sin(angle)*radius,45,ARENA.h-40);
        if(openPoint(px,py,r)) return {x:px,y:py};
      }
    }
    return {x:ARENA.w/2,y:ARENA.h/2};
  }

  function lineOpen(x,y,tx,ty){
    if(!underground()) return true;
    const steps = Math.ceil(Math.hypot(tx-x,ty-y) / 16);
    for(let i=1;i<steps;i++){
      if(blocksMovement(lerp(x,tx,i/steps),lerp(y,ty,i/steps),4)) return false;
    }
    return true;
  }
  function dashDistance(p,ax,ay,distance,r=9){
    if(!underground()) return distance;
    let open = 0;
    while(open < distance) {
      const next = Math.min(open+5,distance);
      if(blocksMovement(p.x+ax*next,p.y+ay*next,r)) break;
      open=next;
    }
    return open;
  }
  function clearRails(body,r) {
    if(!underground()) return;
    for(const wall of rails) {
      const left=wall.x-r, right=wall.x+wall.w+r, top=wall.y-r, bottom=wall.y+wall.h+r;
      if(body.x<=left || body.x>=right || body.y<=top || body.y>=bottom) continue;
      const closest = Math.min(body.x-left,right-body.x,body.y-top,bottom-body.y);
      if(closest===body.x-left) body.x=left;
      else if(closest===right-body.x) body.x=right;
      else if(closest===body.y-top) body.y=top;
      else body.y=bottom;
    }
  }

  function cell(x,y) { return clamp(Math.floor(y/step),0,rows-1)*cols + clamp(Math.floor(x/step),0,cols-1); }
  function buildNavigation(target) {
    const blocked = field.blocked || (field.blocked = Array.from({length:cols*rows}, (_,i) => {
      const x=(i%cols+.5)*step, y=(Math.floor(i/cols)+.5)*step;
      return x<22 || x>ARENA.w-22 || y<24 || y>ARENA.h-24
        || blocksMovement(x,y,16);
    }));
    const next = new Int16Array(cols*rows).fill(-1), queue=[target];
    next[target]=target;
    for(let head=0;head<queue.length;head++) {
      const i=queue[head], x=i%cols, y=Math.floor(i/cols);
      for(const [dx,dy] of offsets) {
        const nx=x+dx, ny=y+dy, j=ny*cols+nx;
        if(nx<0 || ny<0 || nx>=cols || ny>=rows || blocked[j] || next[j]>=0) continue;
        next[j]=i; queue.push(j);
      }
    }
    field.target=target; field.nav=next;
  }
  function chase(enemy) {
    if(!underground() || enemy.fly || lineOpen(enemy.x,enemy.y,G.p.x,G.p.y)) return null;
    const target=cell(G.p.x,G.p.y);
    if(field.target!==target) buildNavigation(target);
    const from=cell(enemy.x,enemy.y);
    let next=field.nav[from];
    if(next<0){
      const cx=from%cols, cy=Math.floor(from/cols);
      for(const [dx,dy] of offsets){
        const x=cx+dx, y=cy+dy;
        if(x>=0 && x<cols && y>=0 && y<rows && field.nav[y*cols+x]>=0){ next=y*cols+x; break; }
      }
    }
    if(next<0 || from===target) return null;
    const dx=(next%cols+.5)*step-enemy.x, dy=(Math.floor(next/cols)+.5)*step-enemy.y;
    const len=Math.hypot(dx,dy)||1;
    return {x:dx/len,y:dy/len};
  }

  function nearby() {
    if(!field || G.mode!=='play' || G.phase!=='wave' || !G.p) return null;
    const near = s => Math.hypot(G.p.x-s.x,G.p.y-s.y)<43;
    if(!field.inside && !field.power && near(breaker)) return {label:'合上电闸',action:'power'};
    if(field.inside && !field.vent && near(relay)) return {label:'启动排风',action:'vent'};
    if(field.power && G.t >= field.liftReady && near(lift)) return {label:field.inside?'返回地表':'进入地下', action:'lift'};
    return null;
  }
  function interact() {
    const use=nearby();
    if(!use) return false;
    if(use.action==='power') {
      field.power=true; G.shield++; G.shieldFx=.8;
      banner('地表电闸已合上','获得一层护盾 · 东侧升降机已供电',1.45);
    } else if(use.action==='vent') {
      field.vent=true; G.buff.stasis=Math.max(G.buff.stasis,5);
      banner('排风系统启动','敌群减速 5 秒',1.3);
    } else {
      setFloor(!field.inside);
      field.liftReady = G.t + .65;
      banner(field.inside?'B1 · 地下检修廊':'F1 · 落日废土',field.inside?'沿黄线前往排风配电台':'沿地表继续当前波次',1.1);
    }
    SFX.pick(); paintInstruments(true);
    return true;
  }
  function paintHud() {
    if(G.p && G.mode === 'play') drawMap(byId('miniFieldMap'),false);
    const button=byId('fieldInteract'), use=nearby();
    button.hidden=!use;
    if(use) putText(button,'R  '+use.label);
    const hint=byId('fieldObjective');
    hint.hidden=!field;
    if(!field) return;
    putText(hint,G.phase !== 'wave' ? 'F1 · 地表交战' : field.inside ?
      (field.vent?'B1 · 排风已启动':'B1 · 沿黄线启动排风') :
      (field.power?'F1 · 升降机可用':'F1 · 合上应急电闸'));
  }
  function drawStation(point,label,lit,color,isLift) {
    const x=SX(point.x), y=SY(point.y);
    if(x < -50 || x > VW+50 || y < -25 || y>VH+45) return;
    ctx.save(); ctx.translate(x,y);
    ctx.strokeStyle=color; ctx.lineWidth=1.8;
    ctx.fillStyle=isLift?'#172c30':'#243334';
    ctx.beginPath();ctx.ellipse(0,0,isLift?22:13,isLift?11:7,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.fillStyle=lit?color:'#738683';
    if(isLift) {
      ctx.fillRect(-11,-3,22,2);ctx.fillRect(-7,0,14,2);ctx.fillRect(-3,3,6,2);
    } else {
      ctx.fillStyle='#35474b'; ctx.fillRect(-8,-12,16,10);
      ctx.fillStyle=color;ctx.fillRect(-6,-12,12,2);ctx.fillRect(-4,-8,6,3);
    }
    ctx.font='bold 8px sans-serif';ctx.textAlign='center';
    ctx.lineWidth=2.7;ctx.strokeStyle='#10191b';ctx.strokeText(label,0,-18);
    ctx.fillStyle=lit?color:'#bdcbc9';ctx.fillText(label,0,-18);ctx.restore();
  }
  function draw() {
    if(!field)return;
    drawStation(lift,field.power?(field.inside?'地表升降机':'地下升降机'):'升降机 · 待供电',field.power,'#89d6ce',true);
    if(field.inside) drawStation(relay,field.vent?'排风运转':'排风配电台',!field.vent,'#efc976',false);
    else drawStation(breaker,field.power?'已供电':'应急电闸',!field.power,'#ffd17b',false);
    if(G.phase !== 'wave') return;
    const objective = field.inside ? (field.vent ? lift : relay) : (field.power ? lift : breaker);
    const x=SX(objective.x), y=SY(objective.y);
    const bx=clamp(x,24,VW-24), by=clamp(y,36,VH-28);
    if(x===bx && y===by) return;
    ctx.save();
    ctx.translate(bx,by);
    ctx.rotate(Math.atan2(y-by,x-bx));
    ctx.strokeStyle='#111a20';
    ctx.fillStyle='#ffce83';
    ctx.lineWidth=2.4;
    ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-7,5);ctx.lineTo(-3,0);ctx.lineTo(-7,-5);
    ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
  }

  function drawMap(canvas, detail){
    const g=canvas.getContext('2d');
    const w=canvas.width, h=canvas.height, pad=detail?16:3;
    const sx=(w-2*pad)/ARENA.w, sy=(h-2*pad)/ARENA.h;
    const x=world=>pad+world*sx, y=world=>pad+world*sy;
    g.fillStyle='#182526';g.fillRect(0,0,w,h);
    g.strokeStyle='#a4b6a670';g.strokeRect(pad+.5,pad+.5,w-2*pad-1,h-2*pad-1);
    if(underground()){
      g.fillStyle='#71877b';
      for(const wall of rails) g.fillRect(x(wall.x),y(wall.y),wall.w*sx,wall.h*sy);
    } else {
      g.fillStyle='#627769';
      for(const prop of G.props){
        if(prop.solid || prop.lm) g.fillRect(x(prop.x-prop.r),y(prop.y-prop.r),2*prop.r*sx,2*prop.r*sy);
      }
    }
    g.strokeStyle='#b1c9a833';
    g.strokeRect(x(clamp(G.cam.x-VW/2,0,ARENA.w)),y(clamp(G.cam.y-VH/(2*KZ),0,ARENA.h)),
      Math.min(VW,ARENA.w)*sx,Math.min(VH/KZ,ARENA.h)*sy);
    const mark=(pt,color,r,label)=>{
      g.fillStyle=color;g.beginPath();g.arc(x(pt.x),y(pt.y),r,0,TAU);g.fill();
      if(detail && label){
        g.font='600 19px sans-serif';g.lineWidth=4;g.strokeStyle='#182526';
        const labelW=g.measureText(label).width;
        const tx=x(pt.x)+labelW+12<w-pad ? x(pt.x)+10 : x(pt.x)-labelW-10;
        const ty=y(pt.y)<pad+28 ? y(pt.y)+25 : y(pt.y)-10;
        g.strokeText(label,tx,ty);g.fillText(label,tx,ty);
      }
    };
    for(const e of G.enemies){ if(!e.dead) mark(e,'#b97368',detail?2.4:1.35); }
    const size=detail?5:2.5;
    if(field){
      mark(lift,'#99dcce',size,'升降机');
      if(underground()) mark(relay,'#f2c96e',size,'排风配电台');
      else mark(breaker,'#f2c96e',size,'应急电闸');
    }
    if(G.boss && !G.boss.dead) mark(G.boss,'#ff8573',size,'首领');
    if(G.portal) mark(G.portal,'#9ff2ae',size,'传送门');
    g.lineWidth=detail?2:1;
    g.strokeStyle='#192122';g.fillStyle='#fff7da';
    g.beginPath();g.arc(x(G.p.x),y(G.p.y),detail?4:2.1,0,TAU);g.fill();g.stroke();
  }

  function openMap(){
    if(G.mode !== 'play' || !G.p) return false;
    keys.up=keys.down=keys.left=keys.right=false;
    joyEnd();
    G.mode='map';
    putText(byId('fieldMapTitle'),SCENES[G.stage].name + (field ? (underground()?' · 地下检修廊':' · 地表') : ''));
    drawMap(byId('openFieldMap'),true);
    byId('fieldMapDialog').showModal();
    return true;
  }

  function closeMap(){
    if(G.mode!=='map') return;
    G.mode='play';
    wakeGame();
  }

  return {load,begin,prepareSurface,underground,floorId,stations,blocksMovement,lineOpen,dashDistance,clearRails,
    openPoint,safePoint,chase,interact,returnForEncounter,paintHud,draw};
})();
