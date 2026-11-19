/* One randomized incident per campaign sector. Effects use battle time. */
const StageEvents = (() => {
  const lootText = '普通敌人 9% → 18%，精英 38% → 76%。';
  const incidents = {
    scavengers:{name:'掠夺队突袭',icon:'✺',color:'#ffa083',pack:['runner','gunner'],count:8},
    patrol:{name:'雨棚下的巡逻队',icon:'✺',color:'#ffa083',pack:['drone','runner','lancer'],count:7},
    caveIn:{name:'侧坑涌出虫群',icon:'✺',color:'#ffa083',pack:['bomber','tank'],count:9},
    breach:{name:'裂隙漏出游兵',icon:'✺',color:'#e4acff',pack:['runner','drone','sniper'],count:8},
    salvage:{name:'废土回收窗口',icon:'✦',color:'#ffd396',drop:2,duration:20},
    caches:{name:'矿标物资暴露',icon:'✦',color:'#aff3e2',drop:2,duration:18},
    overflow:{name:'过热磁匣',icon:'✦',color:'#ffbe94',drop:1.5,move:.85,duration:16,
      risk:'16 秒内敌人道具掉落率 ×1.5（普通 13.5%，精英 57%），移速 -15%。可以绕开。'},
    distortion:{name:'相位超频',icon:'⌁',color:'#e5b5ff',rate:1.32,move:.84,duration:15,
      risk:'15 秒内射速 ×1.32，移速 -16%。可以绕开。'},
    rifle:{name:'机匣诊断终端',icon:'⇄',color:'#a8e9ff',skill:['power','rapid','crit'],duration:18},
    voltage:{name:'雨夜校准信号',icon:'⇄',color:'#a8e9ff',skill:['rapid','chain','pierce'],duration:18},
    frost:{name:'低温弹药调校',icon:'⇄',color:'#a8e9ff',skill:['freeze','armor','pierce'],duration:18},
    coil:{name:'炉线测试台',icon:'⇄',color:'#a8e9ff',skill:['burn','blast','power'],duration:18},
    prism:{name:'折相校准频段',icon:'⇄',color:'#d5baff',skill:['pierce','chain','crit'],duration:18},
    salve:{name:'避雷棚医疗箱',icon:'✚',color:'#a3efbd',heal:.32},
    shields:{name:'工厂应急护盾',icon:'⛨',color:'#c4d8ff',shield:2}
  };
  const regions = [
    {waves:[2,7,10],events:['scavengers','salvage','rifle']},
    {waves:[2,4,10],events:['patrol','voltage','salve']},
    {waves:[2,7,12],events:['caveIn','caches','frost']},
    {waves:[2,4,11],events:['overflow','coil','shields']},
    {waves:[2,7,12],events:['breach','prism','distortion']}
  ];
  // The archive keeps the original 10% wild card as instant support.
  const legacy = [0,5,11,12];
  let scheduled = null, active = null;

  function plan(stage,rng=Math.random){
    const region=regions[stage];
    const archive=rng()<.1;
    const pool=archive?legacy:region.events;
    return {stage,wave:region.waves[Math.floor(rng()*region.waves.length)],
      key:pool[Math.floor(rng()*pool.length)],archive};
  }

  function reset(){ scheduled=active=null; }
  function begin(stage){ scheduled=G.runMode==='tower'?null:plan(stage); }

  function clear(reason){
    if(!active) return;
    const {name,skill,move,rate}=active;
    active=null;
    if(skill || move || rate) recalc({fillNewCapacity:false});
    if(reason) CampaignStory.transmit(name+' · '+reason);
  }

  function skill(){
    const id=active?.skill;
    return id && (G.skills[id]||0)<SK[id].max ? id : null;
  }

  function applyStats(s){
    if(active?.move) s.spdMul*=active.move;
    if(active?.rate) s.rateMul*=active.rate;
  }

  function dropChance(elite){ return (elite ? .38 : .09)*(active?.drop || 1); }

  function offer(spec){
    const id=spec.skill?.find(key=>(G.skills[key]||0)<SK[key].max);
    const temp=spec.skill && !id ? {...spec,rate:1.18} : spec;
    const desc=spec.risk || (spec.pack ? '最多 '+spec.count+' 名敌人分批抵达，敌群已满时延后。拉开距离即可，敌潮照常推进。' :
      spec.drop ? spec.duration+' 秒内，击破敌人获得双倍道具掉落率。'+lootText :
      spec.skill ? spec.duration+' 秒内'+(id?'「'+SK[id].n+'」临时 +1 级，上限 '+SK[id].max+' 级。':'射速 ×1.18。')+'持续效果不占技能槽。' :
      spec.heal ? '恢复 32% 生命上限的生命。' : '获得 2 层护盾。');
    return {n:spec.name,ic:spec.icon,c:spec.color,desc,optional:!!spec.risk,
      apply(){
        if(spec.heal) heal(G.p.maxHp*spec.heal);
        else if(spec.shield){G.shield+=spec.shield;G.shieldFx=.5;}
        else {
          active={...temp,skill:id,expires:G.t+(spec.pack?8:spec.duration),
            wave:G.wave,remaining:spec.count,next:G.t+1.25};
          if(id || temp.move || temp.rate) recalc({fillNewCapacity:false});
        }
        CampaignStory.transmit(spec.name+' · '+desc);
      },
      decline(){CampaignStory.transmit('已绕过'+spec.name+'。');}
    };
  }

  function check(){
    if(!scheduled || G._evtRolled || G.runMode==='tower' || G.mode!=='play' || G.phase!=='wave' ||
      G.stage!==scheduled.stage || G.wave!==scheduled.wave || G.waveDur-G.waveT<2.4 || G.waveT<7) return false;
    const legacyEvent=scheduled.archive ? EVENTS[scheduled.key] : null;
    const event=legacyEvent ? {...legacyEvent,apply(){
      legacyEvent.apply();CampaignStory.transmit(legacyEvent.n+' · '+legacyEvent.desc);
    }} : offer(incidents[scheduled.key]);
    G._evtRolled=true;
    return triggerEvent(event);
  }

  function spawnPack(){
    if(G.phase!=='wave' || G.wave!==active.wave || G.t>=active.expires){clear('额外来袭结束');return;}
    if(!active.remaining || G.t<active.next) return;
    active.next=G.t+.85;
    const count=Math.min(2,active.remaining,ThreatPacing.enemyCap()-G.enemies.length);
    for(let i=0;i<count;i++){
      const p=spawnPointNear(), sample=Math.random();
      const kind=FieldMaps.underground() ? CampaignEnemies.kind(G.stage,G.wave,FieldMaps.floorId(),sample) :
        active.pack[Math.floor(sample*active.pack.length)];
      spawnEnemy(kind,p.x,p.y,{noElite:true,variantRoll:sample});
      active.remaining--;
    }
  }

  function tick(){
    if(G.mode!=='play' || G.runMode==='tower') return false;
    if(active?.pack) spawnPack();
    else if(active && G.t>=active.expires) clear('效果已结束');
    return check();
  }

  function status(){
    if(!active) return '';
    const left=Math.max(0,Math.ceil(active.expires-G.t));
    if(active.pack) return '来袭 '+left+'s';
    if(active.skill) return SK[active.skill].n+(skill()?' +1':' 已达上限')+' '+left+'s';
    return active.name+' '+left+'s';
  }

  return {reset,begin,plan,check,tick,clear,skill,applyStats,dropChance,status};
})();
