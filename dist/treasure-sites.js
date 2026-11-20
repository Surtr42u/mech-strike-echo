/* A run seed chooses one side cache on each surface and each explorable lower floor.
   Placement / cache flavour are seeded per run; the loot roll itself is stage-weighted,
   never repeats the previous cache's reward and may turn into a two-loot jackpot or an
   opt-in ambush. */
const TreasureSites = (() => {
  const sites = {
    '0:surface':{name:'废堤补给室',color:'#e6be88',cover:'crate',points:[[.18,.24],[.83,.72],[.21,.77],[.62,.20],[.47,.68]]},
    '0:underground':{name:'检修廊储物间',color:'#e5cd97',points:[[.22,.25],[.85,.77],[.38,.72],[.63,.23],[.70,.70]]},
    '1:surface':{name:'高架站台储物柜',color:'#91ded8',cover:'pipe',points:[[.23,.23],[.83,.66],[.20,.76],[.66,.24],[.48,.70]]},
    '2:surface':{name:'露天测绘站',color:'#a5e2e9',cover:'crystal',points:[[.25,.23],[.78,.23],[.19,.71],[.55,.74],[.73,.65]]},
    '2:ice-mine':{name:'停运矿车库',color:'#e0c69d',points:[[.80,.16],[.85,.77],[.27,.77],[.62,.28],[.30,.43]]},
    '3:surface':{name:'冷渣隔间',color:'#f1a785',cover:'rock',points:[[.22,.23],[.81,.70],[.18,.73],[.58,.24],[.52,.69]]},
    '4:surface':{name:'隔离舱仓库',color:'#d7b8fb',cover:'pillar',points:[[.20,.24],[.26,.77],[.77,.76],[.68,.22],[.47,.68]]}
  };
  const siteKeys = Object.keys(sites);
  const rareSites = ['0:underground','2:ice-mine','3:surface','4:surface'];
  /* 只在开箱后展示；开箱前只给「物资箱 / 军械箱」两种叫法。 */
  const cacheColors = {normal:'#f0c883',rare:'#c9a0ff',trap:'#ff7a4c',opened:'#6e8c88'};
  /* 六个奖励种类，按战区缩放。每关权重和都是 100。 */
  const rewards = [
    {id:'heal',w:[30,27,24,21,18]},
    {id:'shield',w:[15,15,16,16,16]},
    {id:'xp',w:[18,18,18,17,16]},
    {id:'skill',w:[12,14,16,18,19]},
    {id:'hex',w:[8,8,9,10,11]},
    {id:'buff',w:[17,18,17,18,20]}
  ];
  /* 海克斯档位：常规箱可出白银，稀有箱至少黄金；后期棱彩概率抬高。 */
  const hexTiers = [
    [['silver',35],['gold',55],['prism',10]],
    [['gold',82],['prism',18]],
    [['gold',82],['prism',18]],
    [['gold',62],['prism',38]],
    [['gold',50],['prism',50]]
  ];
  const rareHexTiers = [
    [['gold',60],['prism',40]],
    [['gold',55],['prism',45]],
    [['gold',50],['prism',50]],
    [['gold',40],['prism',60]],
    [['gold',30],['prism',70]]
  ];
  const buffPool = [
    {id:'magnet',min:12,max:16,apply:seconds=>{G.buff.magnet=Math.max(G.buff.magnet,seconds);},
      text:seconds=>'磁力固件：拾取范围 ×1.7，持续 '+seconds+' 秒。'},
    {id:'over',min:10,max:14,apply:seconds=>{G.buff.over=Math.max(G.buff.over,seconds);},
      text:seconds=>'超载固件：射速 +55%，持续 '+seconds+' 秒。'},
    {id:'stasis',min:4,max:6,apply:seconds=>{G.buff.stasis=Math.max(G.buff.stasis,seconds);},
      text:seconds=>'时滞固件：敌人减速 75%，持续 '+seconds+' 秒。'},
    {id:'luck',min:10,max:14,apply:seconds=>{G.buff.luck=Math.max(G.buff.luck,seconds);},
      text:seconds=>'幸运固件：经验获取 ×2，持续 '+seconds+' 秒。'},
    {id:'fleet',min:8,max:12,apply:seconds=>{G.buff.fleet=Math.max(G.buff.fleet,seconds);},
      text:seconds=>'疾风固件：移速 +35%，持续 '+seconds+' 秒。'}
  ];
  let seed=0, active=null, rare=null, rooms=new Map();
  let recentKinds=[], lastBuff='';

  function reset(){
    seed = (Math.random()*2**32)>>>0;
    const rng=mulberry(seed);
    rare=rareSites[Math.floor(rng()*rareSites.length)];
    active=null;
    rooms.clear();
    recentKinds=[];
    lastBuff='';
  }

  function stageIndex(){
    const stage=Math.floor(G.stage)||0;
    return stage<0?0:stage>4?4:stage;
  }

  function scaledWeight(entry,stage,isRare){
    let weight=entry.w[stage] || 0;
    if(isRare){
      if(entry.id==='hex') weight*=4;
      else if(entry.id==='skill') weight*=1.8;
      else if(entry.id==='heal' || entry.id==='xp') weight*=.55;
    }
    return weight;
  }

  function rollKind(rng,isRare,skip){
    const stage=stageIndex(), blocked=skip || [];
    const pool=rewards.filter(entry=>!blocked.includes(entry.id)).map(entry=>({
      id:entry.id, w:scaledWeight(entry,stage,isRare)
    }));
    let roll=(rng || Math.random)()*pool.reduce((sum,entry)=>sum+entry.w,0);
    for(const entry of pool){
      roll-=entry.w;
      if(roll<0) return entry.id;
    }
    return pool[pool.length-1].id;
  }

  function cacheType(room){
    return room.trap ? 'trap' : room.rare ? 'rare' : 'normal';
  }

  function hexTier(room){
    const table=room.rare ? rareHexTiers[stageIndex()] : hexTiers[stageIndex()];
    let roll=Math.random()*table.reduce((sum,entry)=>sum+entry[1],0);
    for(const entry of table){
      roll-=entry[1];
      if(roll<0) return entry[0];
    }
    return table[table.length-1][0];
  }

  function prepare(){
    active=null;
    if(G.runMode==='tower') return;
    const key=G.stage+':'+FieldMaps.floorId(), spec=sites[key];
    if(!spec) return;
    let room=rooms.get(key);
    if(!room){
      const slot=siteKeys.indexOf(key)+1;
      const rng=mulberry(seed ^ Math.imul(slot,0x9e3779b9));
      const [x,y]=spec.points[Math.floor(rng()*spec.points.length)];
      const origin=FieldMaps.safePoint(ARENA.w*x,ARENA.h*y,36);
      const isRare=key===rare;
      const trap=rng()<.18;
      const jackpot=rng()<(isRare ? .12 : .07);
      const kind=rollKind(rng,isRare,recentKinds);
      room={...origin,key,spec,kind,trap,jackpot,rare:isRare,opened:false,cover:[]};
      if(spec.cover){
        const inner=(x<.5?1:-1)*28;
        for(const dy of [-39,39]){
          const cx=origin.x-inner,cy=origin.y+dy;
          if(FieldMaps.openPoint(cx,cy,20)) room.cover.push({kind:spec.cover,x:cx,y:cy,r:13,h:25,
            seed:rng()*20,solid:true,grp:-5,lift:0});
        }
      }
      rooms.set(key,room);
    }
    for(const prop of room.cover) if(!G.props.includes(prop)) G.props.push(prop);
    active=room;
  }

  function nearby(){
    return active && !active.opened && G.runMode!=='tower' && G.mode==='play' && G.phase!=='boss' &&
      d2(G.p.x,G.p.y,active.x,active.y)<43**2 && FieldMaps.lineOpen(G.p.x,G.p.y,active.x,active.y) ? active : null;
  }

  function xpText(amount){
    const total=Math.round(amount*(G.buff.luck>0?2:1));
    return total+(G.buff.luck>0?'（幸运 ×2）':'');
  }

  function grantHeal(){
    if(G.p.hp>=G.p.maxHp){
      const layers=Math.random()<.5?1:2;
      G.shield+=layers;G.shieldFx=Math.max(G.shieldFx || 0,.5);
      return '生命已满，医疗包换为 '+layers+' 层护盾。';
    }
    const pct=.30+Math.random()*.10;
    const before=G.p.hp;
    heal(G.p.maxHp*pct);
    return '回复 '+Math.ceil(G.p.hp-before)+' 生命（最大生命的 '+Math.round(pct*100)+'%）。';
  }

  function grantShield(){
    const layers=Math.random()<.55?1:2;
    G.shield+=layers;G.shieldFx=Math.max(G.shieldFx || 0,.6);
    return '获得 '+layers+' 层护盾。';
  }

  function grantXp(){
    const doubled=Math.random()<.22;
    const amount=(12+G.stage*3)*(doubled?2:1);
    gainXp(amount,false);
    return (doubled?'战术资料翻倍！':'')+'获得 '+xpText(amount)+' 经验。';
  }

  function skillUpCandidates(){
    const maxOf=id=>SK[id]?.max ?? 99;
    return G.slots.filter(id=>SK[id] && G.skills[id]>0 && G.skills[id]<maxOf(id));
  }

  function skillNewCandidates(){
    const owned=new Set(G.slots);
    return (typeof TALENTS!=='undefined' && TALENTS.pool ? TALENTS.pool : [])
      .filter(card=>!owned.has(card.id) && SK[card.id]);
  }

  function skillTargetAvailable(){
    return skillUpCandidates().length>0 ||
      (G.slots.length<G.skillLimit && skillNewCandidates().length>0);
  }

  function grantSkill(){
    const maxOf=id=>SK[id]?.max ?? 99;
    const fitted=skillUpCandidates();
    if(fitted.length){
      const id=fitted[Math.floor(Math.random()*fitted.length)];
      G.skills[id]++;
      recalc({fillNewCapacity:false});
      return {kind:'skill',text:'技能校准：'+SK[id].n+' 升至 Lv.'+G.skills[id]+'（上限 Lv.'+maxOf(id)+'）。'};
    }
    if(G.slots.length<G.skillLimit){
      const pool=skillNewCandidates();
      if(pool.length){
        const id=pool[Math.floor(Math.random()*pool.length)].id;
        G.skills[id]=1;G.slots.push(id);
        recalc({fillNewCapacity:false});
        return {kind:'skill',text:'技能校准：新技能 '+SK[id].n+' Lv.1 已装入空槽（'+G.slots.length+'/'+G.skillLimit+'）。'};
      }
    }
    const amount=12+G.stage*3;
    gainXp(amount,false);
    return {kind:'xp',text:(G.slots.length>=G.skillLimit?'技能槽已满':'已无可校准技能')+
      '，校准换为 '+xpText(amount)+' 经验。'};
  }

  function grantHex(room){
    const wanted=hexTier(room);
    const order=room.rare ?
      [wanted,wanted==='prism'?'gold':'prism'] :
      [wanted].concat(['gold','prism','silver'].filter(tier=>tier!==wanted));
    for(const tier of order){
      if(HEXES.queueExternal(tier,'treasure'))
        return {kind:'hex',text:'获得一次'+HEXES.tierNames[tier]+'海克斯五选一。'};
    }
    const amount=12+G.stage*3;
    gainXp(amount,false);
    return {kind:'xp',text:'海克斯通路暂时无法接入，储备换为 '+xpText(amount)+' 经验。'};
  }

  function grantBuff(){
    const pool=buffPool.filter(buff=>buff.id!==lastBuff &&
      !(buff.id==='luck' && G.buff.luck>30));
    const buff=pool[Math.floor(Math.random()*pool.length)] || buffPool[0];
    const seconds=Math.round(buff.min+Math.random()*(buff.max-buff.min));
    buff.apply(seconds);
    lastBuff=buff.id;
    return buff.text(seconds);
  }

  function award(kind,room){
    if(kind==='skill') return grantSkill();
    if(kind==='hex') return grantHex(room);
    if(kind==='heal') return {kind:'heal',text:grantHeal()};
    if(kind==='shield') return {kind:'shield',text:grantShield()};
    if(kind==='xp') return {kind:'xp',text:grantXp()};
    return {kind:'buff',text:grantBuff()};
  }

  function settleKinds(room){
    const blocked=recentKinds.slice(), kinds=[];
    let first=room.kind;
    if(blocked.includes(first)) first=rollKind(Math.random,room.rare,blocked);
    /* 技能已无目标时会退化成经验；上一箱刚好是经验时先换一种，避免连续重复。 */
    if(first==='skill' && blocked.includes('xp') && !skillTargetAvailable())
      first=rollKind(Math.random,room.rare,blocked.concat('skill'));
    kinds.push(first);blocked.push(first);
    if(room.jackpot){
      let second=rollKind(Math.random,room.rare,blocked);
      if(second==='skill' && blocked.includes('xp') && !skillTargetAvailable())
        second=rollKind(Math.random,room.rare,blocked.concat('skill'));
      kinds.push(second);
    }
    return kinds;
  }

  /* 破损军械箱的伏兵：只在可战斗的战役场景里生成，且不写 dungeonRoom，
     避免被地下箱庭当成房间守军。奖励已在调用前结算，不会丢失。 */
  function springTrap(room){
    if(G.runMode==='tower' || G.phase==='boss' || G.mode!=='play' || !G.p) return 0;
    const count=5+Math.floor(Math.random()*3);
    const floor=FieldMaps.floorId();
    const maxRank=G.stage>=2?2:1;
    const wave=Math.max(1,G.wave || 1);
    let spawned=0;
    for(let i=0;i<count;i++){
      const angle=(i/count)*TAU+Math.random()*.5-.25;
      const radius=105+Math.random()*65;
      const tx=Math.max(32,Math.min(ARENA.w-32,room.x+Math.cos(angle)*radius));
      const ty=Math.max(44,Math.min(ARENA.h-36,room.y+Math.sin(angle)*radius));
      const point=FieldMaps.safePoint(tx,ty,18);
      if(d2(point.x,point.y,G.p.x,G.p.y)<70**2) continue;
      const kind=CampaignEnemies.kind(G.stage,wave,floor,Math.random(),maxRank);
      if(spawnEnemy(kind,point.x,point.y,{noElite:true})) spawned++;
    }
    if(spawned){
      G.rings.push({x:room.x,y:room.y,r:10,max:112,life:.55,maxLife:.55,col:cacheColors.trap,w:3});
      floatText(room.x,room.y,'伏兵！',cacheColors.trap,true);
    }
    return spawned;
  }

  function interact(){
    const room=nearby();
    if(!room) return false;
    const kinds=settleKinds(room);
    const results=kinds.map(kind=>award(kind,room));
    let message=results.map(result=>result.text).join(' ');
    recentKinds=results.map(result=>result.kind);
    room.opened=true;
    let spawned=0;
    if(room.trap){
      spawned=springTrap(room);
      message+=' '+(spawned ? '伏兵从四周出现（'+spawned+'）！' : '伏兵未能封住退路。');
    }
    if(room.jackpot) message='双份战利品：'+message;
    CampaignStory.transmit((room.rare?'稀有物资 · ':'')+room.spec.name+' · '+message);
    if(room.trap && room.jackpot) banner('满载物资 · 伏兵！',message,2.0);
    else if(room.trap) banner('破损军械箱 · 伏兵！',message,1.8);
    else if(room.jackpot) banner('满载物资！',message,1.9);
    else banner(room.spec.name,message,1.5);
    spark(room.x,room.y,room.jackpot?14:8,cacheColors[cacheType(room)],room.jackpot?110:75);
    if(room.trap) spark(room.x,room.y,10,cacheColors.trap,135);
    SFX.pick();
    if(room.trap) SFX.boom();
    paintInstruments(true);
    if(openReward()) render();
    return true;
  }

  function label(room){ return room.trap ? '军械箱' : '物资箱'; }

  function clearOfChest(point){
    if(!active || active.opened || d2(point.x,point.y,active.x,active.y)>=90**2) return point;
    for(let i=0;i<8;i++){
      const angle=i*TAU/8;
      const p=FieldMaps.safePoint(active.x+Math.cos(angle)*130,active.y+Math.sin(angle)*130,26);
      if(d2(p.x,p.y,active.x,active.y)>=90**2) return p;
    }
    return point;
  }

  function marker(){
    if(!active || G.runMode==='tower') return null;
    const {x,y,opened,spec}=active;
    return {x,y,opened,name:opened?spec.name+' · 已开启':label(active),
      color:opened?cacheColors.opened:cacheColors[cacheType(active)]};
  }

  function draw(g){
    if(!active || G.runMode==='tower') return;
    const room=active, opened=room.opened, x=SX(room.x), y=SY(room.y);
    if(x < -75 || x > VW+75 || y < -44 || y > VH+64) return;
    const type=cacheType(room), base=cacheColors[type];
    const accent=room.rare ? cacheColors.rare : base;
    const pulse=.5+.5*Math.sin((G.t || 0)*3.4+(room.x || 0)*.03);
    g.save();g.translate(x,y);
    if(!opened){
      g.globalAlpha=.10+.14*pulse;
      g.fillStyle=base;
      g.beginPath();g.ellipse(0,13,42,15,0,0,TAU);g.fill();
      g.globalAlpha=.22+.30*pulse;
      g.strokeStyle=base;g.lineWidth=1.4;
      g.beginPath();g.ellipse(0,10,38+3*pulse,13+1.5*pulse,0,0,TAU);g.stroke();
      g.globalAlpha=1;
    }
    g.fillStyle='#102527df';g.fillRect(-35,-20,70,42);
    g.strokeStyle=base;g.globalAlpha=opened?.40:.66;g.lineWidth=type==='rare'?2.4:2;
    g.beginPath();g.moveTo(-35,20);g.lineTo(-35,-20);g.lineTo(35,-20);g.lineTo(35,20);g.stroke();
    if(room.rare && !opened){
      g.globalAlpha=.42;g.strokeStyle=accent;g.lineWidth=1;
      g.beginPath();g.moveTo(-31,17);g.lineTo(-31,-16);g.lineTo(31,-16);g.lineTo(31,17);g.stroke();
    }
    g.globalAlpha=.62;
    g.setLineDash([2,6]);g.beginPath();g.moveTo(-31,19);g.lineTo(31,19);g.stroke();g.setLineDash([]);
    g.globalAlpha=1;
    if(type==='trap' && !opened){
      g.save();
      g.beginPath();g.rect(-35,-20,70,6);g.clip();
      g.fillStyle='#2a1410';g.fillRect(-35,-20,70,6);
      g.strokeStyle='#ffc06a';g.lineWidth=1.6;
      for(let i=-38;i<38;i+=8){ g.beginPath();g.moveTo(i,-20);g.lineTo(i+7,-14);g.stroke(); }
      g.restore();
    }
    g.fillStyle='#14242b';g.fillRect(-17,-10,34,17);
    g.strokeStyle=opened?'#768f87':type==='trap'?'#ff9a63':base;
    g.strokeRect(-17,-10,34,17);
    if(opened){
      g.fillStyle='#405759';g.fillRect(-18,-17,36,7);
      g.fillStyle='#24383d';g.fillRect(-12,-7,24,5);
    } else {
      g.fillStyle=type==='trap'?'#ffb15c':base;
      g.fillRect(-17,-12,34,4);
      g.fillRect(-3,-7,6,7);
      if(room.rare){
        g.save();g.translate(0,-18);g.rotate(Math.PI/4);
        g.fillStyle=accent;g.globalAlpha=.55+.35*pulse;
        g.fillRect(-2.5,-2.5,5,5);
        g.restore();
      }
    }
    const title=opened?'已开启':label(room);
    g.font='bold 9px sans-serif';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#10191b';
    g.strokeText(title,0,-29);g.fillStyle=opened?'#a8b9ae':base;g.fillText(title,0,-29);g.restore();
  }

  return {reset,prepare,nearby,interact,label,marker,clearOfChest,draw};
})();
