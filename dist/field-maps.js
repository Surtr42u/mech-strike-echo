/* The lift links two floors of sector 01. Combat time, rewards and enemies persist. */
const FieldMaps = (() => {
  const lift = {x:618, y:398};
  const breaker = {x:522, y:348};
  const relay = {x:752, y:226};
  const rails = [
    {x:294,y:165,w:28,h:222}, {x:294,y:363,w:206,h:24},
    {x:432,y:202,w:204,h:24}, {x:610,y:204,w:26,h:106},
    {x:672,y:325,w:27,h:204}, {x:500,y:500,w:175,h:24},
    {x:773,y:386,w:138,h:25}, {x:206,y:497,w:138,h:23}
  ];
  const step = 32, cols = 33, rows = 23;
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
    document.getElementById('fieldInteract').addEventListener('click', interact);
    window.addEventListener('keydown', event => {
      if(event.code === 'KeyR' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && G.mode === 'play') {
        if(interact()) event.preventDefault();
      }
    });
  }

  function begin(stage) {
    field = stage === 0 ? {inside:false, power:false, vent:false, surface:null, tunnel:null, nav:null, target:-1} : null;
    document.getElementById('fieldInteract').hidden = true;
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
    m.beginPath(); m.moveTo(lift.x,lift.y); m.lineTo(645,398); m.lineTo(645,288);
    m.lineTo(748,288); m.lineTo(relay.x,relay.y); m.stroke();
    const pads = [{x:490,y:425},{x:759,y:295},{x:376,y:455}];
    return {ground:floor,marks,props:[],pads,anchors:[]};
  }

  function setFloor(inside) {
    if(inside && !field.tunnel) field.tunnel = buildTunnel();
    const layout = inside ? field.tunnel : field.surface;
    field.inside = inside;
    G.ground = layout.ground; G.groundMarks = layout.marks; G.props = layout.props;
    G.supplyPads = layout.pads; G.spawnAnchors = layout.anchors;
    G.scars.length = 0;
    STAGE3D.invalidateGround();
    G.sceneFx = .32;
    if(inside) {
      clearRails(G.p,9);
      for(const enemy of G.enemies) if(!enemy.fly) clearRails(enemy,enemy.r);
    }
  }

  function underground() { return !!field && field.inside; }
  function blocksMovement(x,y,r) {
    return underground() && rails.some(w =>
      x>w.x-r && x<w.x+w.w+r && y>w.y-r && y<w.y+w.h+r);
  }
  function dashDistance(p,ax,ay,distance) {
    if(!underground()) return distance;
    let open = 0;
    while(open < distance) {
      const next = Math.min(open+5,distance);
      if(blocksMovement(p.x+ax*next,p.y+ay*next,9)) break;
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
        || blocksMovement(x,y,11);
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
    if(!underground() || enemy.fly || enemy.shoot>0) return null;
    const target=cell(G.p.x,G.p.y);
    if(field.target!==target) buildNavigation(target);
    const from=cell(enemy.x,enemy.y), next=field.nav[from];
    if(next<0 || next===target || from===target) return null;
    const dx=(next%cols+.5)*step-enemy.x, dy=(Math.floor(next/cols)+.5)*step-enemy.y;
    const len=Math.hypot(dx,dy)||1;
    return {x:dx/len,y:dy/len};
  }

  function nearby() {
    if(!field || G.mode!=='play' || !G.p) return null;
    const near = s => Math.hypot(G.p.x-s.x,G.p.y-s.y)<43;
    if(!field.inside && !field.power && near(breaker)) return {label:'合上电闸',action:'power'};
    if(field.inside && !field.vent && near(relay)) return {label:'启动排风',action:'vent'};
    if(field.power && near(lift)) return {label:field.inside?'返回地表':'进入地下', action:'lift'};
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
      banner(field.inside?'B1 · 地下检修廊':'F1 · 落日废土',field.inside?'沿黄色标线前往配电台':'返回地表战区',1.1);
    }
    SFX.pick(); paintInstruments(true);
    return true;
  }
  function paintHud() {
    const button=byId('fieldInteract'), use=nearby();
    button.hidden=!use;
    if(use) putText(button,'R  '+use.label);
    const hint=byId('fieldObjective');
    hint.hidden=!field;
    if(!field) return;
    putText(hint,field.inside ? (field.vent?'B1 · 排风已启动':'B1 · 沿黄线启动排风') :
      (field.power?'F1 · 东侧升降机可用':'F1 · 靠近电闸恢复供电'));
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
  }
  return {load,begin,prepareSurface,underground,blocksMovement,dashDistance,clearRails,chase,interact,paintHud,draw};
})();
