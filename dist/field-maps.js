/* The lift changes the active floor. Both layouts share one combat clock and enemy budget. */
const FieldMaps = (() => {
  const source = {
    lift:{x:618,y:398}, breaker:{x:522,y:348}, core:{x:400,y:86}, relay:{x:100,y:110}
  };
  /* 落日废土 B1：入口厅 → 泵房 → 排风配电室。折返走廊 + 掩体，不是规整九宫格。 */
  const dungeonWalls = [
    /* 入口厅（升降机所在） */
    {x:486,y:640,w:330,h:16}, {x:800,y:300,w:16,h:356}, {x:484,y:300,w:16,h:356},
    {x:484,y:284,w:116,h:16}, {x:672,y:284,w:144,h:16},
    {x:536,y:520,w:92,h:18}, {x:736,y:446,w:18,h:92}, {x:676,y:590,w:86,h:16},
    /* 泵房 */
    {x:344,y:44,w:376,h:16}, {x:344,y:44,w:16,h:68}, {x:344,y:168,w:16,h:48},
    {x:704,y:44,w:16,h:172}, {x:344,y:200,w:256,h:16}, {x:672,y:200,w:48,h:16},
    {x:470,y:132,w:82,h:16}, {x:600,y:86,w:16,h:62}, {x:610,y:150,w:58,h:16},
    /* 排风配电室（小 Boss 房） */
    {x:44,y:44,w:272,h:16}, {x:44,y:44,w:16,h:312}, {x:44,y:340,w:272,h:16},
    {x:300,y:44,w:16,h:52}, {x:300,y:184,w:16,h:172},
    {x:150,y:78,w:22,h:58}, {x:86,y:250,w:96,h:18}, {x:250,y:230,w:18,h:70},
    /* 两条联络走廊 */
    {x:584,y:200,w:16,h:84}, {x:672,y:200,w:16,h:84},
    {x:300,y:96,w:44,h:16}, {x:300,y:168,w:44,h:16}
  ];
  const doorLayout = [
    {x:600,y:284,w:72,h:16,axis:'h'},
    {x:344,y:112,w:16,h:56,axis:'v'}
  ];
  const dungeonRooms = [
    {name:'卸料厅', bounds:{x:500,y:300,w:300,h:340}, count:12, elites:1,
      spawns:[[530,340],[750,340],[770,450],[740,570],[620,590],[520,560],[530,460],
        [680,320],[510,570],[720,500],[760,410],[520,390]],
      kinds:['burrower','runner','gunner','shellback']},
    {name:'泵房', bounds:{x:360,y:60,w:344,h:140}, count:14, elites:2,
      spawns:[[420,72],[470,90],[560,80],[660,80],[690,120],[680,180],[620,170],
        [540,180],[440,180],[380,110],[390,170],[500,110],[580,110],[650,140]],
      kinds:['burrower','runner','tank','gunner','caster','shellback']},
    {name:'排风配电室', bounds:{x:60,y:60,w:240,h:280}, count:1, elites:1,
      spawns:[[210,260]], kinds:['bastion'], boss:true}
  ];
  const step = 32;
  let lift, breaker, core, relay, lowerLift, liner, bridgeValve, rails, doors, roomRects, cols, rows;
  const point = (x,y) => ({x:x*ARENA.w/1040, y:y*ARENA.h/720});
  const rectAt = r => ({x:r.x*ARENA.w/1040, y:r.y*ARENA.h/720,
    w:r.w*ARENA.w/1040, h:r.h*ARENA.h/720});
  const inRect = (r,x,y,pad=0) => x>r.x-pad && x<r.x+r.w+pad && y>r.y-pad && y<r.y+r.h+pad;
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
    const mine = stage === 2;
    field = stage === 0 || mine ? {
      mine,inside:false,power:false,vent:false,surface:null,tunnel:null,nav:null,target:-1,liftReady:0,
      bridge:false, bridgeT:-9, cliff:null, bridgeRect:null,
      dungeon: mine ? null : {started:false,room:0,phase:'fight',spawned:[false,false,false],
        cleared:[false,false,false],marks:[[],[],[]],boss:null,bossDown:false,liftHintT:0,t:0}
    } : null;
    if(field){
      const stations = mine ? MineFloor.stations : source;
      const at = ({x,y})=>point(x,y);
      lift = at(stations.lift);
      if(mine){
        lowerLift = at(stations.lowerLift); liner = at(stations.liner);
        bridgeValve = at(stations.bridgeValve);
        field.cliff = rectAt(MineFloor.cliff); field.bridgeRect = rectAt(MineFloor.bridge);
        doors = [];
      } else {
        breaker = at(stations.breaker); core = at(stations.core); relay = at(stations.relay);
        doors = doorLayout.map((d,i)=>({...rectAt(d),axis:d.axis,open:false,id:i}));
      }
      rails = (mine ? MineFloor.walls : dungeonWalls).map(rectAt);
      roomRects = dungeonRooms.map(r=>({...r,bounds:rectAt(r.bounds),
        spawns:r.spawns.map(([x,y])=>point(x,y))}));
    }
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
    if(!field.mine) texture(G.ground.getContext('2d'),'surface-ground',.44);
    const access = field.mine ? [lift] : [lift,breaker];
    G.props = G.props.filter(p => p.lm || access.every(s => Math.hypot(p.x-s.x,p.y-s.y) > p.r+48));
  }

  function snapshotLayout(){
    return {ground:G.ground,marks:G.groundMarks,props:G.props,pads:G.supplyPads,anchors:G.spawnAnchors};
  }

  function buildTunnel() {
    const floor = document.createElement('canvas');
    floor.width = ARENA.w; floor.height = ARENA.h;
    const g = floor.getContext('2d');
    g.fillStyle = '#233238'; g.fillRect(0,0,floor.width,floor.height);
    texture(g,'underground-floor',.87);
    g.fillStyle = '#12252942'; g.fillRect(0,0,floor.width,floor.height);
    const marks = document.createElement('canvas');
    marks.width = ARENA.w; marks.height = ARENA.h;
    const m = marks.getContext('2d');
    if(field.mine){
      const {pads,track} = MineFloor.bake(g,m,rails,point);
      return {ground:floor,marks,props:[],pads,anchors:[],track};
    }
    /* 三间厅室的底板：磨损钢板 + 接缝，和走廊连成折返动线 */
    for(const room of dungeonRooms){
      const p = point(room.bounds.x,room.bounds.y), size = point(room.bounds.w,room.bounds.h);
      g.fillStyle = '#1d3036'; g.fillRect(p.x,p.y,size.x,size.y);
      g.fillStyle = '#ffffff06';
      for(let yy=14;yy<size.y;yy+=30) g.fillRect(p.x+5,p.y+yy,size.x-10,1);
      g.strokeStyle = '#45606455'; g.lineWidth = 2;
      g.strokeRect(p.x+4,p.y+4,size.x-8,size.y-8);
    }
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
    /* 磨损黄线：升降机 → 1 号门 → 泵房核心 → 2 号门 → 排风台 */
    m.strokeStyle='#c2a15eaa'; m.lineWidth=3; m.setLineDash([12,11]);
    m.beginPath(); m.moveTo(lift.x,lift.y);
    for(const [x,y] of [[636,360],[636,220],[600,170],[470,170],[400,130],[352,140],[250,140],[100,110]]){
      const p=point(x,y); m.lineTo(p.x,p.y);
    }
    m.stroke();
    m.beginPath(); m.moveTo(point(470,170).x,point(470,170).y);
    m.lineTo(core.x,core.y); m.stroke();
    m.setLineDash([]);
    const pads = [point(530,560),point(690,160),point(190,290)];
    return {ground:floor,marks,props:[],pads,anchors:[]};
  }

  function invalidateNav(){
    if(!field) return;
    field.blocked = null; field.nav = null; field.target = -1;
  }

  function startDungeon(){
    const d = field?.dungeon;
    if(!d || d.started) return;
    d.started = true;
    d.liftHintT = G.t + 4;
    /* 进入箱庭时清掉地表追兵：旧敌人不计入房间清空，也不让玩家替旧波次收尾 */
    if(typeof EnemyTactics !== 'undefined' && EnemyTactics.detach)
      for(const e of G.enemies) EnemyTactics.detach(e);
    G.enemies.length = 0;
    G.eb.length = 0;
    if(field.vent){
      d.spawned = [true,true,true]; d.cleared = [true,true,true];
      d.bossDown = true; d.phase = 'done';
      for(const door of doors) door.open = true;
    } else {
      d.room = 0; d.phase = 'fight';
      for(const door of doors) door.open = false;
    }
    invalidateNav();
  }

  function setFloor(inside, exchange = true){
    if(!field) return;
    if(inside){
      field.surface = snapshotLayout();
      field.tunnel ??= buildTunnel();
    } else Object.assign(field.tunnel,snapshotLayout());
    const layout = inside ? field.tunnel : field.surface;
    field.inside = inside;
    G.ground = layout.ground; G.groundMarks = layout.marks; G.props = layout.props;
    G.supplyPads = layout.pads; G.spawnAnchors = layout.anchors;
    G.scars.length = 0;
    G.bullets.length = G.eb.length = G.haz.length = 0;
    G.parts.length = G.rings.length = G.lightsFx.length = G.texts.length = 0;
    STAGE3D.invalidateGround();
    G.sceneFx = .32;
    if(field.mine){
      const target = inside ? lowerLift : lift;
      Object.assign(G.p,{...target,vx:0,vy:0});
      Object.assign(G.cam,target);
    }
    invalidateNav();
    clearRails(G.p,playerRadius(9));
    for(const crate of G.crates) clearRails(crate,18);
    if(exchange) reformWaveEnemies(floorId());
    if(!field.mine && inside) startDungeon();
    TreasureSites.prepare();
  }

  function returnForEncounter(){
    if(!underground()) return;
    setFloor(false,false);
    Object.assign(G.p,{x:lift.x,y:lift.y,vx:0,vy:0});
    Object.assign(G.cam,{x:lift.x,y:lift.y});
    CampaignStory.transmit(field.mine?'矿井升降台已回到地表迎战。击破首领后仍可下矿井。':'升降机已回到地表迎战。击破首领后仍可下井。');
  }

  function underground() { return !!field && field.inside; }
  function mineBelow(){ return underground() && field.mine; }
  function floorId(){ return underground() ? field.mine?'ice-mine':'underground' : 'surface'; }
  function stations(){
    if(!field) return null;
    return field.mine ? {lift:{...lift},lowerLift:{...lowerLift},bridgeValve:{...bridgeValve},liner:{...liner}} :
      {lift:{...lift},breaker:{...breaker},core:{...core},relay:{...relay}};
  }

  /* ── 箱庭状态（主代理 HUD / 波次冻结接口） ── */
  function dungeonActive(){
    if(!field || field.mine || !field.dungeon) return false;
    return field.inside || (field.dungeon.started && !field.vent);
  }
  function dungeonInfo(){
    const total = 3;
    if(!field || field.mine || !field.dungeon)
      return {active:false,room:0,total,phase:'done',title:'',hint:''};
    const d = field.dungeon, active = dungeonActive();
    const phase = field.vent ? 'done' : d.bossDown ? 'vent' : d.room >= 2 ? 'boss' : 'fight';
    const idx = Math.min(2,d.room);
    const room = d.started ? idx + 1 : 0;
    let title = '箱庭 · 待进入';
    let hint = '合上电闸，乘升降机下井';
    if(d.started){
      title = phase === 'done' ? '箱庭已肃清' : '箱庭 ' + (idx+1) + ' / 3 · ' + dungeonRooms[idx].name;
      if(phase === 'done') hint = field.vent ? '乘升降机返回地表' : '排风配电台已启动';
      else if(phase === 'vent') hint = '小 Boss 已击破 · 启动排风配电台';
      else if(phase === 'boss') hint = '击破排风守卫（高血量精英）';
      else if(d.cleared[idx]) hint = '门已开启 · 前往下一厅室';
      else hint = '肃清当前厅室 · 门才会开启';
    }
    return {active,room,total,phase,title,hint};
  }
  function liftLocked(){
    return !!field && !field.mine && field.inside && !field.vent;
  }
  function liftLockHint(){
    if(!liftLocked()) return '';
    const d = field.dungeon;
    if(!d?.bossDown) return '升降机锁定 · 先击破排风配电室的小 Boss';
    return '升降机锁定 · 先启动排风配电台';
  }
  function stormActive(){
    return !!field && !field.mine && !field.inside && !field.vent;
  }
  function vented(){ return !!field && !field.mine && field.vent; }
  function bridgeOpen(){ return !!field && field.mine && !!field.bridge; }
  function cliffBlocked(x,y,r){
    if(!field || !field.mine || !field.inside || field.bridge || !field.cliff) return false;
    return inRect(field.cliff,x,y,r);
  }

  function blocksMovement(x,y,r) {
    if(!underground()) return false;
    if(field.mine){
      if(cliffBlocked(x,y,r)) return true;
    } else if(doors.some(d => !d.open && inRect(d,x,y,r))) return true;
    return rails.some(w => inRect(w,x,y,r));
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
    if(mineBelow()) return shotContact(x,y,tx,ty,4) === null;
    const steps = Math.ceil(Math.hypot(tx-x,ty-y) / 16);
    for(let i=1;i<steps;i++){
      if(blocksMovement(lerp(x,tx,i/steps),lerp(y,ty,i/steps),4)) return false;
    }
    return true;
  }

  function rayEnter(w,x,y,dx,dy,pad){
    const l=w.x-pad,r=w.x+w.w+pad,t=w.y-pad,b=w.y+w.h+pad;
    if((!dx && (x<l || x>r)) || (!dy && (y<t || y>b))) return null;
    const x1=dx?(l-x)/dx:-Infinity,x2=dx?(r-x)/dx:Infinity;
    const y1=dy?(t-y)/dy:-Infinity,y2=dy?(b-y)/dy:Infinity;
    const enter=Math.max(0,Math.min(x1,x2),Math.min(y1,y2));
    const exit=Math.min(Infinity,Math.max(x1,x2),Math.max(y1,y2));
    return enter<=exit ? enter : null;
  }
  function shotContact(x,y,tx,ty,pad=0){
    if(!mineBelow()) return null;
    const dx=tx-x,dy=ty-y;
    let hit=null;
    for(const w of rails){
      const enter=rayEnter(w,x,y,dx,dy,pad);
      if(enter!==null) hit=Math.min(hit??1,enter);
    }
    /* 未架桥的断崖同样阻断弹道；架桥后桥面放行 */
    if(!field.bridge && field.cliff){
      const enter=rayEnter(field.cliff,x,y,dx,dy,pad);
      if(enter!==null) hit=Math.min(hit??1,enter);
    }
    return hit;
  }
  function dashDistance(p,ax,ay,distance,r=playerRadius(9)){
    if(!underground()) return distance;
    let open = 0;
    while(open < distance) {
      const next = Math.min(open+5,distance);
      if(blocksMovement(p.x+ax*next,p.y+ay*next,r)) break;
      open=next;
    }
    return open;
  }

  function pushOut(body,r,rect){
    const left=rect.x-r, right=rect.x+rect.w+r, top=rect.y-r, bottom=rect.y+rect.h+r;
    if(body.x<=left || body.x>=right || body.y<=top || body.y>=bottom) return;
    const closest = Math.min(body.x-left,right-body.x,body.y-top,bottom-body.y);
    if(closest===body.x-left) body.x=left;
    else if(closest===right-body.x) body.x=right;
    else if(closest===body.y-top) body.y=top;
    else body.y=bottom;
  }
  function clearRails(body,r) {
    if(!underground()) return;
    for(const wall of rails) pushOut(body,r,wall);
    if(field.mine){
      if(!field.bridge && field.cliff) pushOut(body,r,field.cliff);
    } else for(const door of doors) if(!door.open) pushOut(body,r,door);
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

  /* ── 箱庭流程 ── */
  function roomCenter(i){
    const b=roomRects?.[i]?.bounds;
    return b ? {x:b.x+b.w/2,y:b.y+b.h/2} : lift;
  }
  function roomAlive(i){
    const marks=field.dungeon.marks[i];
    if(!marks.length) return false;
    for(const e of marks) if(!e.dead && G.enemies.indexOf(e)>=0) return true;
    return false;
  }
  function spawnRoom(i){
    const d=field.dungeon, spec=roomRects[i];
    if(!spec) return false;
    const cap=typeof ENEMY_CAP==='number'?ENEMY_CAP:96;
    const free=cap-G.enemies.length;
    if(free<Math.min(6,spec.count)) return false;
    const total=Math.min(spec.count,free-1);
    let made=0;
    for(let n=0;n<total;n++){
      const base=spec.spawns[n%spec.spawns.length];
      let spot=null;
      for(let t=0;t<6;t++){
        const ax=base.x + (((n+t)%3)-1)*12;
        const ay=base.y + (((((n+t)/3)|0)%3)-1)*8;
        if(d2(ax,ay,G.p.x,G.p.y)>110**2 && openPoint(ax,ay,18)){ spot={x:ax,y:ay}; break; }
      }
      if(!spot) spot=base;
      const e=spawnEnemy(spec.kinds[n%spec.kinds.length],spot.x,spot.y,
        {elite:n<spec.elites,noElite:true});
      if(!e) break;
      e.dungeonRoom=i;
      d.marks[i].push(e);
      made++;
    }
    if(made){ d.spawned[i]=true; d.phase=i>=2?'boss':'fight'; return true; }
    return false;
  }
  function spawnBossRoom(){
    const d=field.dungeon, spec=roomRects[2];
    const cap=typeof ENEMY_CAP==='number'?ENEMY_CAP:96;
    if(G.enemies.length>=cap-2) return false;
    const base=spec.spawns[0], origin=safePoint(base.x,base.y,32);
    const e=spawnEnemy('bastion',origin.x,origin.y,{
      elite:true, noElite:true, hpMul:6,
      commander:{name:'排风守卫 · 锈锚',hint:'重装指挥官 · 击破后解锁排风配电台',col:'#ffc887'}
    });
    if(!e) return false;
    e.dungeonRoom=2; e.dungeonBoss=true;
    d.boss=e; d.spawned[2]=true; d.phase='boss';
    d.marks[2].push(e);
    banner('排风守卫 · 锈锚','高血量精英指挥官 · 击破后解锁排风配电台',1.8);
    return true;
  }
  function openDoor(i,label,note){
    if(doors[i] && !doors[i].open){
      doors[i].open=true;
      invalidateNav();
    }
    field.dungeon.liftHintT = Math.max(field.dungeon.liftHintT,G.t+5);
    banner(label,note,1.35);
    CampaignStory.transmit(note+'。');
  }
  function tickDungeon(dt){
    const d=field?.dungeon;
    if(!field || field.mine || !d) return;
    if(G.mode && G.mode!=='play') return;
    if(!field.inside) return;
    d.t += dt || 0;
    if(field.vent){
      let changed=false;
      for(const door of doors) if(!door.open){ door.open=true; changed=true; }
      if(changed) invalidateNav();
      return;
    }
    if(!d.started) return;
    /* 只在玩家真正踏进下一间厅室时推进；已清理的房间不会回退 */
    const here=roomRects.findIndex(r=>inRect(r.bounds,G.p.x,G.p.y));
    if(here>d.room && d.cleared.slice(0,here).every(Boolean)) d.room=here;
    if(!d.spawned[d.room] && !d.cleared[d.room]){
      if(d.room>=2) spawnBossRoom(); else spawnRoom(d.room);
    }
    /* 战斗房清空只统计本房间刷出的敌人 */
    for(let i=0;i<2;i++){
      if(!d.spawned[i] || d.cleared[i] || i>d.room) continue;
      if(roomAlive(i)) continue;
      d.cleared[i]=true;
      if(i===0) openDoor(0,'箱庭 1 肃清 · 通道开启','卸料厅已肃清，通往泵房的门已开启');
      else openDoor(1,'箱庭 2 肃清 · 通道开启','泵房已肃清，通往排风配电室的门已开启');
    }
    /* 小 Boss 击破 → 排风台解除封锁 */
    if(d.spawned[2] && !d.bossDown){
      const b=d.boss;
      if(!b || b.dead || G.enemies.indexOf(b)<0){
        d.bossDown=true; d.cleared[2]=true; d.phase='vent';
        d.liftHintT=Math.max(d.liftHintT,G.t+5);
        G.rings.push({x:b?.x??roomCenter(2).x,y:b?.y??roomCenter(2).y,
          r:8,max:170,life:.7,maxLife:.7,col:'#ffc887',w:2.4});
        banner('排风守卫已击破','排风配电台解锁 · 启动排风',1.55);
        CampaignStory.transmit('小 Boss 已击破，排风配电台解除封锁。');
      }
    }
    /* 靠近锁死的升降机时给出口头提示 */
    if(G.p && G.t>=d.liftHintT && d2(G.p.x,G.p.y,lift.x,lift.y)<92**2){
      d.liftHintT=G.t+8;
      banner('升降机锁定',liftLockHint(),1.2);
    }
  }

  function nearby() {
    if(!field || G.mode!=='play' || G.phase==='boss' || !G.p) return null;
    const near = s => Math.hypot(G.p.x-s.x,G.p.y-s.y)<43;
    if(field.mine){
      if(field.inside && !CampaignStory.linerBonus() && near(liner)) return {label:'领取矿工缓冲衬板',action:'liner'};
      if(field.inside && !field.bridge && near(bridgeValve)) return {label:'启动地热架桥阀',action:'bridge'};
      const landing = field.inside ? lowerLift : lift;
      return SectorClimate.mineOpen() && G.t>=field.liftReady && near(landing) ?
        {label:field.inside?'返回地表':'下冻晶矿井',action:'lift'} : null;
    }
    if(!field.inside && !field.power && near(breaker)) return {label:'合上电闸',action:'power'};
    if(field.inside && !CampaignStory.coreBonus() && near(core)) return {label:'回收稳压核心',action:'core'};
    if(field.inside && !field.vent && field.dungeon?.bossDown && near(relay)) return {label:'启动排风',action:'vent'};
    if(field.power && G.t >= field.liftReady && !liftLocked() && near(lift))
      return {label:field.inside?'返回地表':'进入地下', action:'lift'};
    return null;
  }
  function interact() {
    const use=nearby();
    if(!use) return (!underground() && SectorClimate.activate()) || TreasureSites.interact();
    if(use.action==='power') {
      field.power=true; G.shield++; G.shieldFx=.8;
      banner('地表电闸已合上','获得一层护盾 · 东侧升降机已供电',1.45);
      CampaignStory.transmit('升降机供电。下井沿黄线清空箱庭，再启动排风配电台。');
    } else if(use.action==='core') {
      CampaignStory.claimCore();
      banner('稳压核心已回收','本局生命上限 +'+CampaignStory.coreBonus(),1.35);
    } else if(use.action==='liner') {
      CampaignStory.claimLiner();
      banner('矿工缓冲衬板已装配','本局护甲 +12 个百分点',1.35);
    } else if(use.action==='bridge') {
      field.bridge=true; field.bridgeT=G.t;
      invalidateNav();
      if(typeof spark==='function') spark(bridgeValve.x,bridgeValve.y,10,'#ffd48a',90);
      G.rings.push({x:field.bridgeRect.x+field.bridgeRect.w/2,
        y:field.cliff.y+field.cliff.h/2,r:5,max:200,life:.75,maxLife:.75,col:'#ffd48a',w:2.4});
      banner('地热架桥阀已启动','冰桥展开 · 断崖北侧通道接通',1.6);
      CampaignStory.transmit('冰桥已展开。北侧回收柜与货轨尽头已可抵达。');
    } else if(use.action==='vent') {
      field.vent=true; G.buff.stasis=Math.max(G.buff.stasis,5);
      if(field.dungeon){
        field.dungeon.phase='done'; field.dungeon.cleared[2]=true;
        for(const door of doors) door.open=true;
        invalidateNav();
      }
      SectorClimate.clearDust();
      CampaignStory.complete();
      banner('排风系统启动','地表尘暴消散 · 升降机解锁 · 敌群减速 5 秒',1.5);
    } else {
      setFloor(!field.inside);
      field.liftReady = G.t + .65;
      if(field.mine) banner(field.inside?'B1 · 冻晶矿井':'F1 · 冰封矿场',field.inside?'先开地热架桥阀，再过断崖':'已回到货轨层',1.1);
      else banner(field.inside?'B1 · 地下箱庭':'F1 · 落日废土',field.inside?'清空三间厅室并启动排风':
          field.vent?'尘暴已停 · 查看灯标':'地表尘暴持续',1.1);
    }
    SFX.pick(); paintInstruments(true);
    return true;
  }
  function paintHud() {
    paintFieldHud();
    const button=byId('fieldInteract');
    if(!button.hidden) return;
    const treasure=TreasureSites.nearby();
    if(!treasure) return;
    button.hidden=false;
    putText(button,'R  打开'+TreasureSites.label(treasure));
  }

  function dungeonObjective(){
    const d=field.dungeon;
    if(!d) return 'B1 · 沿黄线前进';
    if(field.vent) return 'B1 · 排风已启动 · 乘升降机返回地表';
    if(d.bossDown) return 'B1 · 排风配电台已解锁 · 启动排风';
    if(d.room>=2) return 'B1 · 箱庭 3/3 · 击破排风守卫';
    if(d.cleared[d.room]) return d.room===0?
      'B1 · 通道开启 · 前往箱庭 2/3':'B1 · 通道开启 · 前往箱庭 3/3';
    return 'B1 · 箱庭 '+(d.room+1)+'/3 · 肃清当前厅室';
  }

  function paintFieldHud() {
    if(G.p && G.mode === 'play') drawMap(byId('miniFieldMap'),false);
    const markers=SectorClimate.mapMarkers();
    const mineLabel = mineBelow() ? '冻晶矿井' : null;
    putText(byId('fieldMapLabel'),mineLabel ?? markers[0]?.name ?? '地图');
    if(!field){ SectorClimate.paintHud(); return; }
    if(field.mine && !field.inside) SectorClimate.paintHud();
    const button=byId('fieldInteract'), use=nearby();
    if(!field.mine || field.inside || use){
      button.hidden=!use;
      if(use) putText(button,'R  '+use.label);
    }
    const hint=byId('fieldObjective');
    hint.hidden=false;
    const route = CampaignStory.approachRoute();
    if(field.mine){
      const secured = CampaignStory.linerBonus()>0;
      if(field.inside) putText(hint,!field.bridge?'B1 · 南侧近端启动地热架桥阀':
        secured?'B1 · 沿轨返回升降台':'B1 · 冰桥已展开 · 过桥前往北侧回收柜');
      else if(SectorClimate.mineOpen()) putText(hint,route ? route+(secured?'':' · 或下矿井') :
        secured?'F1 · 衬板已回收，固守货轨':'F1 · 货轨已解冻，可下冻晶矿井');
      return;
    }
    if(field.inside){
      const d=field.dungeon;
      if(liftLocked() && d && (d.cleared[d.room] || d.bossDown) &&
        G.p && Math.hypot(G.p.x-lift.x,G.p.y-lift.y)<78){
        putText(hint,liftLockHint());
        return;
      }
      putText(hint,dungeonObjective());
      return;
    }
    const objective = G.phase==='boss'?'F1 · 迎战地表首领':
      field.vent?'F1 · 尘暴已停，查看避雷棚信标':
      field.power?'F1 · 乘升降机下井':'F1 · 沙暴持续 · 合闸下井排风';
    putText(hint,route?(field.vent?route:route+' · 或下井排风'):objective);
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

  function drawDoor(door){
    const x=SX(door.x), y=SY(door.y);
    const w=Math.max(8,door.w), h=Math.max(8,door.h*KZ);
    if(x>VW+50 || x+w<-50 || y>VH+50 || y+h<-50) return;
    ctx.save();
    if(door.open){
      ctx.fillStyle='#173133'; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle='#7fe3cf'; ctx.lineWidth=1.5; ctx.globalAlpha=.8;
      ctx.setLineDash([5,4]); ctx.strokeRect(x+.5,y+.5,w-1,h-1);
      ctx.setLineDash([]); ctx.globalAlpha=1; ctx.fillStyle='#41635f';
      if(door.axis==='h'){
        ctx.fillRect(x,y,5,h); ctx.fillRect(x+w-5,y,5,h);
        ctx.strokeStyle='#c4a16066'; ctx.beginPath();
        ctx.moveTo(x+8,y+h*.5); ctx.lineTo(x+w-8,y+h*.5); ctx.stroke();
      } else {
        ctx.fillRect(x,y,w,5); ctx.fillRect(x,y+h-5,w,5);
      }
    } else {
      ctx.fillStyle='#3a201b'; ctx.fillRect(x,y,w,h);
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
      ctx.strokeStyle='#c96a48'; ctx.lineWidth=3;
      for(let i=-h;i<w+h;i+=13){
        ctx.beginPath(); ctx.moveTo(x+i,y+h); ctx.lineTo(x+i+h,y); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle='#ff9a5c'; ctx.lineWidth=1.8; ctx.strokeRect(x+.5,y+.5,w-1,h-1);
      ctx.fillStyle='#ffd48a'; ctx.fillRect(x+w*.25,y+h*.44,w*.5,Math.max(2,h*.12));
    }
    ctx.font='bold 8px sans-serif'; ctx.textAlign='center';
    const label=door.open?'门 · 已开启':'门 · 封锁';
    ctx.lineWidth=3; ctx.strokeStyle='#10191b';
    ctx.strokeText(label,x+w/2,y-4);
    ctx.fillStyle=door.open?'#8fe3cf':'#ffb27d';
    ctx.fillText(label,x+w/2,y-4);
    ctx.restore();
  }

  function drawDungeon(){
    const d=field.dungeon;
    for(const door of doors) drawDoor(door);
    if(!d) return;
    const b=roomRects[2]?.bounds;
    if(b){
      const alive=!d.bossDown;
      ctx.save();
      ctx.setLineDash([9,7]); ctx.lineWidth=1.6;
      ctx.strokeStyle=alive?'#ff8b6e':'#7fe3cf'; ctx.globalAlpha=.55;
      ctx.strokeRect(SX(b.x),SY(b.y),b.w,b.h*KZ);
      ctx.setLineDash([]); ctx.globalAlpha=1;
      ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
      const label=alive?'小 Boss · 排风守卫':'排风守卫 · 已击破';
      ctx.lineWidth=3; ctx.strokeStyle='#10191b';
      ctx.strokeText(label,SX(b.x+b.w/2),SY(b.y)-7);
      ctx.fillStyle=alive?'#ffb09a':'#8fe3cf';
      ctx.fillText(label,SX(b.x+b.w/2),SY(b.y)-7);
      ctx.restore();
    }
    if(d.started && !d.cleared[d.room] && d.room<2){
      const r=roomRects[d.room].bounds;
      ctx.save();
      ctx.font='bold 9px sans-serif'; ctx.textAlign='left';
      ctx.lineWidth=3; ctx.strokeStyle='#10191b';
      const label='箱庭 '+(d.room+1)+' · '+dungeonRooms[d.room].name;
      ctx.strokeText(label,SX(r.x+8),SY(r.y)+16);
      ctx.fillStyle='#a9c4bd'; ctx.fillText(label,SX(r.x+8),SY(r.y)+16);
      ctx.restore();
    }
  }

  function drawBridgeDeck(){
    const b=field.bridgeRect;
    if(!b) return;
    const x=SX(b.x), y=SY(b.y), w=b.w, h=b.h*KZ;
    ctx.fillStyle='#2b444b';
    ctx.fillRect(x-6,y-2,w+12,7);
    ctx.fillRect(x-6,y+h-5,w+12,7);
    ctx.strokeStyle='#ffd48a99'; ctx.lineWidth=1.2;
    ctx.strokeRect(x-6,y-2,w+12,7);
    ctx.strokeRect(x-6,y+h-5,w+12,7);
    if(!field.bridge){
      ctx.strokeStyle='#ffb27d66'; ctx.setLineDash([6,6]);
      ctx.beginPath(); ctx.moveTo(x+w/2,y+5); ctx.lineTo(x+w/2,y+h-5); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const k=clamp((G.t-(field.bridgeT??G.t))/.7,0,1);
    const cx=x+w/2, half=(w/2)*k;
    ctx.fillStyle='#8fe3ff22'; ctx.fillRect(cx-half-3,y-1,half*2+6,h+2);
    ctx.fillStyle='#33525d'; ctx.fillRect(cx-half,y+3,half*2,h-6);
    ctx.fillStyle='#6d939d'; ctx.fillRect(cx-half,y+3,half*2,3);
    ctx.strokeStyle='#1a3138'; ctx.lineWidth=1;
    for(let px=cx-half+6;px<cx+half;px+=11){
      ctx.beginPath(); ctx.moveTo(px,y+5); ctx.lineTo(px+3,y+h-5); ctx.stroke();
    }
    ctx.strokeStyle='#ffd48a'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(cx-half,y+6); ctx.lineTo(cx+half,y+6);
    ctx.moveTo(cx-half,y+h-7); ctx.lineTo(cx+half,y+h-7); ctx.stroke();
    if(k<1){ ctx.fillStyle='#ffd48a'; ctx.fillRect(cx-half,y+h*.5-1,half*2,2); }
  }

  function drawCliff(){
    const c=field.cliff;
    if(!c) return;
    const x=SX(c.x), y=SY(c.y), w=c.w, h=c.h*KZ;
    if(x>VW+80 || x+w<-80 || y>VH+90 || y+h<-90) return;
    ctx.save();
    ctx.fillStyle='#061017'; ctx.fillRect(x-2,y-4,w+4,h+8);
    const grad=ctx.createLinearGradient(0,y,0,y+h);
    grad.addColorStop(0,'#1d4a58'); grad.addColorStop(.18,'#0a2029');
    grad.addColorStop(.55,'#030c11'); grad.addColorStop(.86,'#0d2b36'); grad.addColorStop(1,'#17404c');
    ctx.fillStyle=grad; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#7fd8e026'; ctx.lineWidth=1;
    for(let i=0;i<18;i++){
      const sx=x+((i*97+G.t*11)%w), sy=y+8+((i*31)%Math.max(1,h-16));
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+18+(i%4)*7,sy+2); ctx.stroke();
    }
    ctx.fillStyle='#bceef5aa'; ctx.fillRect(x,y-2,w,2);
    ctx.fillStyle='#5ba7b5aa'; ctx.fillRect(x,y+h,w,2);
    for(let px=x;px<x+w;px+=24){
      const n=((px-x)/24)|0, dep=7+((n*37)%11);
      ctx.fillStyle=n%3?'#d9f7ff':'#a9e4ef';
      ctx.beginPath(); ctx.moveTo(px,y); ctx.lineTo(px+11,y); ctx.lineTo(px+2,y+dep); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#ffffff88'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(px+2,y); ctx.lineTo(px+2,y+dep-2); ctx.stroke();
    }
    for(let px=x+8;px<x+w;px+=26){
      const n=((px-x)/26)|0, dep=5+((n*29)%10);
      ctx.fillStyle=n%2?'#8fd3df':'#c7f2f8';
      ctx.beginPath(); ctx.moveTo(px,y+h); ctx.lineTo(px+10,y+h); ctx.lineTo(px+3,y+h-dep); ctx.closePath(); ctx.fill();
    }
    drawBridgeDeck();
    ctx.restore();
  }

  function dungeonTarget(){
    if(!field.inside) return CampaignStory.beacon() || (field.power?lift:breaker);
    const d=field.dungeon;
    if(field.vent) return lift;
    if(!d) return lift;
    if(d.bossDown) return relay;
    if(d.room>=2){
      const b=d.boss;
      return b && !b.dead ? b : roomCenter(2);
    }
    if(d.cleared[d.room]) return roomCenter(Math.min(2,d.room+1));
    if(d.room===1 && !CampaignStory.coreBonus()) return core;
    return roomCenter(d.room);
  }

  function draw() {
    TreasureSites.draw(ctx);
    CampaignStory.drawBeacon();
    const portal = CampaignStory.visiblePortal();
    if(portal) drawEdgeGuide(portal,portal.color);
    if(!field){
      SectorClimate.drawStations();
      const station=portal?null:SectorClimate.guideMarker() || CampaignStory.beacon();
      if(station) drawEdgeGuide(station,station.color);
      return;
    }
    if(field.mine){
      drawMine(portal);
      return;
    }
    if(field.inside) drawDungeon();
    const locked = liftLocked();
    drawStation(lift,locked?'升降机 · 锁定':field.power?(field.inside?'升降机 · 返回地表':'地表升降机'):'升降机 · 待供电',
      field.power && !locked,'#89d6ce',true);
    if(field.inside){
      const d=field.dungeon;
      drawStation(relay,field.vent?'排风运转':d?.bossDown?'排风配电台已解锁':'排风配电台 · 封锁',
        field.vent || !!d?.bossDown,'#efc976',false);
      if(!CampaignStory.coreBonus()) drawStation(core,'稳压核心',true,'#aaf0cf',false);
    } else drawStation(breaker,field.power?'已供电':'应急电闸',field.power,'#ffd17b',false);
    if(G.phase==='boss' || portal) return;
    const target = dungeonTarget();
    if(target) drawEdgeGuide(target,target.color || '#ffce83');
  }

  function drawMine(portal){
    const open = SectorClimate.mineOpen(), claimed = CampaignStory.linerBonus()>0;
    if(field.inside){
      drawCliff();
      drawStation(lowerLift,'返回地表',true,'#89d6ce',true);
      drawStation(bridgeValve,field.bridge?'冰桥已展开':'地热架桥阀',field.bridge,'#ffd48a',false);
      MineFloor.drawCabinet(ctx,liner,claimed);
      const target = !field.bridge ? bridgeValve : claimed ? lowerLift : liner;
      drawEdgeGuide(target,field.bridge?'#89d6ce':'#ffd48a');
      return;
    }
    SectorClimate.drawStations();
    drawStation(lift,open?'冻晶矿井升降台':'冻晶矿井 · 冰封',open,'#89d6ce',true);
    if(!portal && G.phase!=='boss'){
      const target = open && !claimed ? lift : SectorClimate.guideMarker() || CampaignStory.beacon();
      if(target) drawEdgeGuide(target,target.color || '#89d6ce');
    }
  }

  function drawEdgeGuide(objective,color){
    const x=SX(objective.x), y=SY(objective.y);
    const bx=clamp(x,24,VW-24), by=clamp(y,36,VH-28);
    if(x===bx && y===by) return;
    ctx.save();
    ctx.translate(bx,by);
    ctx.rotate(Math.atan2(y-by,x-bx));
    ctx.strokeStyle='#111a20';
    ctx.fillStyle=color;
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
      if(field.mine){
        g.fillStyle='#08151c';
        g.fillRect(x(field.cliff.x),y(field.cliff.y),field.cliff.w*sx,field.cliff.h*sy);
        if(field.bridge){
          g.fillStyle='#5d8d99';
          g.fillRect(x(field.bridgeRect.x),y(field.bridgeRect.y),
            field.bridgeRect.w*sx,field.bridgeRect.h*sy);
        }
        g.strokeStyle='#ab9880';g.lineWidth=detail?2:1;
        g.beginPath();
        field.tunnel.track.forEach((p,i)=>i?g.lineTo(x(p.x),y(p.y)):g.moveTo(x(p.x),y(p.y)));
        g.stroke();
      } else {
        if(field.dungeon && !field.dungeon.bossDown){
          const b=roomRects[2].bounds;
          g.fillStyle='#793f3655';g.fillRect(x(b.x),y(b.y),b.w*sx,b.h*sy);
        }
        for(const door of doors){
          g.fillStyle=door.open?'#7fe3cf':'#e08a62';
          g.fillRect(x(door.x),y(door.y),Math.max(1,door.w*sx),Math.max(1,door.h*sy));
        }
      }
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
    if(field?.mine){
      const open = SectorClimate.mineOpen();
      mark(underground()?lowerLift:lift,open?'#99dcce':'#798e9b',size,underground()?'返回地表':open?'冻晶矿井升降台':'矿井升降台 · 冰封');
      if(underground() && !field.bridge) mark(bridgeValve,'#ffd48a',size,'地热架桥阀');
      if(underground() && !CampaignStory.linerBonus()) mark(liner,'#ffe2a1',size,'矿工缓冲衬板');
    } else if(field){
      mark(lift,'#99dcce',size,liftLocked()?'升降机 · 锁定':'升降机');
      if(underground()){
        mark(relay,'#f2c96e',size,field.dungeon?.bossDown?'排风配电台 · 已解锁':'排风配电台');
        if(!CampaignStory.coreBonus()) mark(core,'#aaf0cf',size,'稳压核心');
        if(field.dungeon && !field.dungeon.bossDown){
          mark(roomCenter(2),'#ff8573',size,'小 Boss 房');
        }
      }
      else mark(breaker,'#f2c96e',size,'应急电闸');
    }
    for(const station of SectorClimate.mapMarkers()) mark(station,station.color,size,station.name);
    if(G.boss && !G.boss.dead) mark(G.boss,'#ff8573',size,'首领');
    const route=CampaignStory.visiblePortal() || CampaignStory.beacon();
    if(route) mark(route,route.color,size,route.name);
    const treasure=TreasureSites.marker();
    if(treasure) mark(treasure,treasure.color,size,treasure.name);
    g.lineWidth=detail?2:1;
    g.strokeStyle='#192122';g.fillStyle='#fff7da';
    g.beginPath();g.arc(x(G.p.x),y(G.p.y),detail?4:2.1,0,TAU);g.fill();g.stroke();
  }

  function openMap(){
    if(G.mode !== 'play' || !G.p) return false;
    keys.up=keys.down=keys.left=keys.right=false;
    joyEnd();
    G.mode='map';
    const floor = underground() ? (field.mine?' · 冻晶矿井':' · 地下箱庭') : field?' · 地表':'';
    putText(byId('fieldMapTitle'),SCENES[G.stage].name + floor);
    drawMap(byId('openFieldMap'),true);
    byId('fieldLog').hidden = TOWER.active();
    if(!TOWER.active()) CampaignStory.paintLog();
    byId('fieldMapDialog').showModal();
    return true;
  }

  function closeMap(){
    if(G.mode!=='map') return;
    G.mode='play';
    wakeGame();
  }

  return {load,begin,prepareSurface,underground,floorId,stations,blocksMovement,lineOpen,shotContact,dashDistance,clearRails,
    openPoint,safePoint,chase,setFloor,nearby,interact,returnForEncounter,paintHud,draw,
    stormActive,vented,dungeonActive,dungeonInfo,tickDungeon,liftLocked,liftLockHint,cliffBlocked,bridgeOpen};
})();
