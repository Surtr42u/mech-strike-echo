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

  /* ── 本局战场异常 ──
     进入战区时从池里抽一个，整区生效；同一局不重复。
     效果全部挂在既有接口上：recalc / dropChance / G.haz / frostFactor。
     tone 只用于抽取配平与 HUD 标记：负 = 纯负面，混 = 利弊并存，正 = 纯增益。
     每个战役 5 区保证「正/混」与「负/混」各至少 2 个，且首区不出纯负面。 */
  const anomalies = {
    magnet:{tone:'负',name:'磁暴',icon:'⌁',color:'#9fd8ff',short:'技能冷却 +12%',
      desc:'技能冷却 +12%，整区生效。',
      stats:s=>{ s.skillCooldown *= 1.12; }},
    supply:{tone:'正',name:'补给信号',icon:'▤',color:'#a8f29a',short:'掉落率 +40%',
      desc:'道具掉落率 +40%，整区生效。',drop:1.4},
    tremor:{tone:'负',name:'地脉震动',icon:'≋',color:'#ffb36b',short:'每 7s 落石',
      desc:stage=>'每 7 秒 2 处落石预警，单次 '+(8+stage*2)+' 伤害，整区持续。'},
    sand:{tone:'负',name:'沙暴',icon:'≈',color:'#e8c58a',short:'弹道散布 +35%',
      desc:'能见度下降，弹道散布 +35%（远程更难命中），整区生效。',
      stats:s=>{ s.spreadMul *= 1.35; }},
    void:{tone:'负',name:'虚空潮汐',icon:'◈',color:'#c9a0ff',short:'敌人移速 +10%',
      desc:'敌人移速 +10%，整区生效。',enemySpd:1.1},
    wreck:{tone:'正',name:'装甲残骸',icon:'▣',color:'#c7c1b2',short:'掩体 ×6',
      desc:'额外 6 处装甲残骸掩体，整区生效。'},
    ionfog:{tone:'负',name:'离子雾',icon:'☁',color:'#b6e3ff',short:'射击 12% 哑火',
      desc:'枪械射击有 12% 概率哑火，但道具掉落率 +15% 作为补偿，整区生效。',
      miss:.12,drop:1.15},
    quicksand:{tone:'负',name:'流沙带',icon:'⌛',color:'#e0b96a',short:'移速 -12%',
      desc:'地面松软下陷，移动速度 -12%，整区生效。',
      stats:s=>{ s.spdMul *= .88; }},
    corrosion:{tone:'负',name:'酸蚀雨',icon:'☣',color:'#b7e56a',short:'护甲 -10% · 受伤 +5%',
      desc:'酸雨腐蚀装甲：护甲减伤 -10%，受到伤害 +5%，整区生效。',
      stats:s=>{ s.armor -= .10; s.dmgTaken += .05; }},
    static:{tone:'混',name:'静电风暴',icon:'⚡',color:'#b9e6ff',short:'冷却 +15% · 开局护盾 +1',
      desc:'技能冷却 +15%，但进入战区时获得 1 层护盾，整区生效。',
      stats:s=>{ s.skillCooldown *= 1.15; },shield:1},
    overclock:{tone:'混',name:'过载电网',icon:'⚙',color:'#ff9a5c',short:'射速 +18% · 受伤 +8%',
      desc:'电网过载：射速 +18%，但受到伤害 +8%，整区生效。',
      stats:s=>{ s.rateMul *= 1.18; s.dmgTaken += .08; }},
    mirage:{tone:'混',name:'海市蜃楼',icon:'✧',color:'#ffc9f0',short:'散布 +30% · 暴击 +5%',
      desc:'热浪扭曲弹道：弹道散布 +30%，暴击率 +5%，整区生效。',
      stats:s=>{ s.spreadMul *= 1.30; s.crit += .05; }},
    gravity:{tone:'混',name:'重力异常',icon:'◒',color:'#c7b7ff',short:'移速 -9% · 敌速 -6%',
      desc:'重力场紊乱：移动速度 -9%，敌人移速 -6%，整区生效。',
      stats:s=>{ s.spdMul *= .91; },enemySpd:.94},
    lucky:{tone:'正',name:'幸运潮汐',icon:'❖',color:'#ffd76a',short:'掉落 +30% · 精英更肥',
      desc:'道具掉落率 +30%，精英掉落率额外 +15%，整区生效。',
      drop:1.3,eliteDrop:1.15},
    blackout:{tone:'混',name:'断电区',icon:'◐',color:'#8f9bb3',short:'拾取 -30% · 掉落 +25%',
      desc:'照明失效：拾取范围 -30%，但道具掉落率 +25%，整区生效。',
      stats:s=>{ s.magnet *= .70; },drop:1.25}
  };
  const anomalyPool = Object.keys(anomalies);
  const TONE_MARK = {负:'危险',混:'风险',正:'增益'};
  const CAMPAIGN_SECTORS = 5;
  const MIN_TONE = 2;                 // 正/混、负/混 各至少 2 个
  let scheduled = null, active = null;
  let anomaly = null, used = new Set(), lastAnomaly = '', quakeAt = 0, announcedStage = -1;
  let posMix = 0, negMix = 0, shieldStage = -1;

  function plan(stage,rng=Math.random){
    const region=regions[stage];
    const archive=rng()<.1;
    const pool=archive?legacy:region.events;
    return {stage,wave:region.waves[Math.floor(rng()*region.waves.length)],
      key:pool[Math.floor(rng()*pool.length)],archive};
  }

  function reset(){
    scheduled=active=null;
    anomaly=null;used=new Set();lastAnomaly='';quakeAt=0;announcedStage=-1;
    posMix=negMix=0;shieldStage=-1;
  }

  function hasStats(a){ return !!(a && a.stats); }

  /* 抽取：不重复 + 不连区重复 + 首区不出纯负面 + 全局正负配平。
     配平是贪心的：若剩余战区数已经不够补足某项下限，本区就必须抽对应倾向。
     混合（混）同时计入正、负两侧，所以不会把池子逼死。 */
  function rollAnomaly(stage){
    let pool=anomalyPool.filter(key=>!used.has(key) && key!==lastAnomaly);
    if(!pool.length) pool=anomalyPool.filter(key=>!used.has(key));
    if(!pool.length){ used.clear(); posMix=negMix=0; pool=anomalyPool.filter(key=>key!==lastAnomaly); }
    if(stage===0){
      const opener=pool.filter(key=>anomalies[key].tone!=='负');
      if(opener.length) pool=opener;
    }
    const left=Math.max(0,CAMPAIGN_SECTORS-stage)-1;   // 本区之后还剩几区
    const mustPos=Math.max(0,MIN_TONE-posMix)>left;
    const mustNeg=Math.max(0,MIN_TONE-negMix)>left;
    if(mustPos || mustNeg){
      const fit=pool.filter(key=>{
        const tone=anomalies[key].tone;
        return (!mustPos || tone!=='负') && (!mustNeg || tone!=='正');
      });
      if(fit.length) pool=fit;
    }
    const key=pool[Math.floor(Math.random()*pool.length)];
    const tone=anomalies[key].tone;
    used.add(key);lastAnomaly=key;
    if(tone!=='负') posMix++;
    if(tone!=='正') negMix++;
    anomaly={...anomalies[key],key,stage};
    quakeAt=G.t+4.5;announcedStage=-1;
  }

  /* SectorClimate.prepareProps 会先调用一次，保证残骸等地图异常参与烘焙。 */
  function prepare(stage){
    if(G.runMode==='tower' || !(stage>=0)){ anomaly=null; return; }
    if(anomaly && anomaly.stage===stage) return;
    const had=hasStats(anomaly);
    rollAnomaly(stage);
    if(had || hasStats(anomaly)) recalc({fillNewCapacity:false});
    /* 静电风暴：每区入场的一次性护盾（不走 stats，避免与护盾上限混淆）。 */
    if(anomaly.shield && shieldStage!==stage){
      shieldStage=stage;
      G.shield=(G.shield||0)+anomaly.shield;
      G.shieldFx=.5;
    }
  }

  function anomalyDesc(a=anomaly){
    if(!a) return '';
    return typeof a.desc==='function' ? a.desc(a.stage) : a.desc;
  }

  function begin(stage){
    scheduled=G.runMode==='tower'?null:plan(stage);
    prepare(stage);
    if(G.runMode==='tower' || !anomaly || announcedStage===stage || !G.jobs) return;
    announcedStage=stage;
    const key=anomaly.key,desc=anomalyDesc(anomaly);
    /* 战区横幅由 game.js 在 setScene 之后播放，延后 2.55s 避开它。 */
    G.jobs.push({t:2.55,fn:function(){
      if(G.runMode==='tower' || G.stage!==stage || anomaly?.key!==key) return;
      banner(anomaly.name,'本区异常 · '+desc,2.8);
    }});
  }

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
    if(anomaly?.stats) anomaly.stats(s);
  }

  function dropChance(elite){
    return (elite ? .38*(anomaly?.eliteDrop || 1) : .09) *
      (active?.drop || 1) * (anomaly?.drop || 1);
  }

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

  /* 地脉震动：每 7 秒落在玩家周围两处，1.15 秒预警后由现有落区结算。 */
  function anomalyTick(){
    if(!anomaly || G.phase==='clear') return;
    if(anomaly.key==='void' && G.boss && !G.boss.dead && !G.boss.voidTide){
      G.boss.spd*=1.1;G.boss.voidTide=true;   // 首领也吃虚空潮汐
    }
    if(anomaly.key==='gravity' && G.boss && !G.boss.dead && !G.boss.gravTide){
      G.boss.spd*=.94;G.boss.gravTide=true;   // 重力异常同样拖慢首领
    }
    if(anomaly.key!=='tremor' || G.t<quakeAt) return;
    quakeAt=G.t+7;
    const dmg=8+G.stage*2;
    for(let i=0;i<2;i++){
      const a=Math.random()*TAU,r=110+Math.random()*170;
      const x=clamp(G.p.x+Math.cos(a)*r,48,ARENA.w-48);
      const y=clamp(G.p.y+Math.sin(a)*r*.8,54,ARENA.h-48);
      addZone(x,y,36,dmg,1.15);
    }
    G.shake=Math.max(G.shake||0,2.5);
  }

  function tick(){
    if(G.mode!=='play' || G.runMode==='tower') return false;
    anomalyTick();
    if(active?.pack) spawnPack();
    else if(active && G.t>=active.expires) clear('效果已结束');
    return check();
  }

  function remainingText(){
    if(G.phase==='boss') return '首领战';
    if(G.phase==='clear') return '待撤离';
    const total=typeof WAVES_PER_STAGE==='number'?WAVES_PER_STAGE:14;
    return '剩'+Math.max(1,total-(G.wave||1)+1)+'波';
  }

  function anomalyStatus(){
    if(!anomaly || G.runMode==='tower') return '';
    return (TONE_MARK[anomaly.tone]||'异常')+' · '+anomaly.name+' · '+anomaly.short+' · '+remainingText();
  }

  /* 离子雾的哑火率；其他异常或塔模式返回 0。 */
  function missChance(){
    if(!anomaly || G.runMode==='tower') return 0;
    return anomaly.miss || 0;
  }

  function eventStatus(){
    if(!active) return '';
    const left=Math.max(0,Math.ceil(active.expires-G.t));
    if(active.pack) return '来袭 '+left+'s';
    if(active.skill) return SK[active.skill].n+(skill()?' +1':' 已达上限')+' '+left+'s';
    return active.name+' '+left+'s';
  }

  /* HUD 单行：异常 + 当前事件可同时出现，不互相覆盖。 */
  function status(){
    return [anomalyStatus(),eventStatus()].filter(Boolean).join(' · ');
  }

  return {reset,begin,prepare,plan,check,tick,clear,skill,applyStats,dropChance,missChance,
    status,eventStatus,anomalyStatus,anomalyDesc,anomalyInfo:()=>anomaly,
    anomalyId:()=>anomaly?.key||'',enemySpeedMul:()=>anomaly?.enemySpd||1};
})();
