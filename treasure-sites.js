/* A run seed chooses one side cache on each surface and each explorable lower floor. */
const TreasureSites = (() => {
  const sites = {
    '0:surface':{name:'废堤补给室',color:'#e6be88',cover:'crate',points:[[.18,.24,'heal'],[.83,.72,'xp'],[.21,.77,'buff']]},
    '0:underground':{name:'检修廊储物间',color:'#e5cd97',points:[[.22,.25,'upgrade'],[.85,.77,'xp'],[.38,.72,'heal']]},
    '1:surface':{name:'高架站台储物柜',color:'#91ded8',cover:'pipe',points:[[.23,.23,'xp'],[.83,.66,'buff'],[.20,.76,'upgrade']]},
    '2:surface':{name:'露天测绘站',color:'#a5e2e9',cover:'crystal',points:[[.25,.23,'xp'],[.78,.23,'heal'],[.19,.71,'upgrade']]},
    '2:ice-mine':{name:'停运矿车库',color:'#e0c69d',points:[[.80,.16,'upgrade'],[.85,.77,'xp'],[.27,.77,'buff']]},
    '3:surface':{name:'冷渣隔间',color:'#f1a785',cover:'rock',points:[[.22,.23,'buff'],[.81,.70,'heal'],[.18,.73,'upgrade']]},
    '4:surface':{name:'隔离舱仓库',color:'#d7b8fb',cover:'pillar',points:[[.20,.24,'xp'],[.26,.77,'upgrade'],[.77,.76,'buff']]}
  };
  const rareSites = ['0:underground','2:ice-mine','3:surface','4:surface'];
  const kinds = {heal:'医疗包',xp:'战术资料',upgrade:'改装零件',buff:'战术固件',hex:'海克斯储备'};
  const priorities = [
    ['power','rapid','hp'], ['chain','crit','magnet'], ['freeze','armor','pierce'],
    ['burn','blast','rapid'], ['pierce','speed','multi']
  ];
  let seed=0, active=null, rare=null, rooms=new Map();

  function reset(){
    seed = (Math.random()*2**32)>>>0;
    const rng=mulberry(seed);
    rare=rareSites[Math.floor(rng()*rareSites.length)];
    active=null;
    rooms.clear();
  }

  function prepare(){
    active=null;
    if(G.runMode==='tower') return;
    const key=G.stage+':'+FieldMaps.floorId(), spec=sites[key];
    if(!spec) return;
    let room=rooms.get(key);
    if(!room){
      const rng=mulberry(seed ^ (Object.keys(sites).indexOf(key)+1)*0x9e3779b9);
      const [x,y,reward]=spec.points[Math.floor(rng()*spec.points.length)];
      const origin=FieldMaps.safePoint(ARENA.w*x,ARENA.h*y,36);
      const loot=key===rare?'hex':reward;
      const roll=rng();
      const tier=G.stage===0 ? (roll<.65?'silver':'gold') : (roll<.7?'gold':'prism');
      room={...origin,key,spec,loot,tier,roll,opened:false,cover:[]};
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

  function award(room){
    const xp=12+G.stage*3;
    if(room.loot==='heal'){
      if(G.p.hp>=G.p.maxHp){ G.shield++;G.shieldFx=.5;return '生命已满，医疗包换为 1 层护盾。'; }
      const before=G.p.hp;
      heal(G.p.maxHp*.35);
      return '回复 '+Math.ceil(G.p.hp-before)+' 生命，上限为最大生命的 35%。';
    }
    if(room.loot==='upgrade'){
      const fits=id=>G.skills[id]>0 && G.skills[id]<SK[id].max;
      const skill=priorities[G.stage].find(fits) || G.slots.find(fits);
      if(skill){
        G.skills[skill]++;
        recalc({fillNewCapacity:false});
        return SK[skill].n+' 升至 Lv.'+G.skills[skill]+'，沿用原技能槽。';
      }
      gainXp(xp,false);
      return '无可升级的已装备技能，零件换为 '+xp+' 经验。';
    }
    if(room.loot==='xp'){
      gainXp(xp,false);
      return '获得 '+xp+' 经验。';
    }
    if(room.loot==='buff'){
      if(room.roll<.5){G.buff.magnet=Math.max(G.buff.magnet,12);return '12 秒内拾取范围 ×1.7。';}
      G.buff.over=Math.max(G.buff.over,10);return '10 秒内射速 +55%。';
    }
    const tiers = [room.tier,...['gold','silver','prism'].filter(tier=>tier!==room.tier)];
    const tier = tiers.find(tier=>HEXES.queueExternal(tier,'treasure'));
    if(tier) return '已获得一次'+HEXES.tierNames[tier]+'海克斯五选一。';
    gainXp(xp,false);
    return '本局可选海克斯不足，储备换为 '+xp+' 经验。';
  }

  function interact(){
    const room=nearby();
    if(!room) return false;
    const message=award(room);
    room.opened=true;
    CampaignStory.transmit(room.spec.name+' · '+message);
    banner(room.spec.name,message,1.4);
    spark(room.x,room.y,8,room.spec.color,75);
    SFX.pick();paintInstruments(true);
    if(openReward()) render();
    return true;
  }

  function label(room){ return kinds[room.loot]; }

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
    return {x,y,opened,name:opened?spec.name+' · 已开启':label(active),color:opened?'#6e8c88':'#f0c883'};
  }

  function draw(g){
    if(!active || G.runMode==='tower') return;
    const {spec,opened}=active,x=SX(active.x),y=SY(active.y);
    if(x < -75 || x > VW+75 || y < -44 || y > VH+64) return;
    g.save();g.translate(x,y);
    g.fillStyle='#102527df';g.fillRect(-35,-20,70,42);
    g.strokeStyle=spec.color;g.globalAlpha=.62;g.lineWidth=2;
    g.beginPath();g.moveTo(-35,20);g.lineTo(-35,-20);g.lineTo(35,-20);g.lineTo(35,20);g.stroke();
    g.setLineDash([2,6]);g.beginPath();g.moveTo(-31,19);g.lineTo(31,19);g.stroke();g.setLineDash([]);
    g.globalAlpha=1;g.fillStyle='#14242b';g.fillRect(-17,-10,34,17);
    g.strokeStyle=opened?'#768f87':spec.color;
    g.strokeRect(-17,-10,34,17);
    if(opened){
      g.fillStyle='#405759';g.fillRect(-18,-17,36,7);
      g.fillStyle='#24383d';g.fillRect(-12,-7,24,5);
    } else {
      g.fillStyle=spec.color;g.fillRect(-17,-12,34,4);
      g.fillRect(-3,-7,6,7);
    }
    const title=opened?'已开启':label(active);
    g.font='bold 9px sans-serif';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#10191b';
    g.strokeText(title,0,-29);g.fillStyle=opened?'#a8b9ae':spec.color;g.fillText(title,0,-29);g.restore();
  }

  return {reset,prepare,nearby,interact,label,marker,clearOfChest,draw};
})();
