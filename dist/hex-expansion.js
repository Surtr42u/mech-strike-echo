'use strict';

const HEX_EXPANSION = (() => {
  const cadence={every:3,power:1.65};
  const follow={rounds:2,seconds:3,power:1.45};
  const longSight=Object.freeze({range:180,bonus:.18});
  const relay={interval:5,power:1.34};
  const march={meters:155,energy:7,refund:.85};
  const stride={meters:205,rounds:2,pierce:3};
  const hunter={interval:2.4,seconds:2,speed:1.35,rate:1.28};
  const hive={interval:2.2,rounds:3,power:1.42};
  const exit={refund:.50,rounds:5,power:1.58,seconds:5,lockedRounds:3,lockedPower:1.40,interval:4};
  const cards={
    frostCoat:{tier:'silver',n:'凝霜底剂',ic:'❄',tags:['control','fire'],
      d:'弹丸附加一级冻结效果，普攻弹速 +8%。',apply:s=>{s.freeze++;s.bspdMul*=1.08;}},
    steadyRest:{tier:'silver',n:'沉稳枪架',ic:'⊥',tags:['fire','guard'],
      d:'站定 0.65 秒后普攻射速 +19%，开始移动即解除。'},
    longSight:{tier:'silver',n:'远距标尺',ic:'⊙',tags:['pierce','fire'],
      d:`每次普攻的一枚主弹直接命中时，若离发射时的驾驶员位置至少 ${longSight.range}，伤害 +${longSight.bonus*100}%。`},
    scrapPouch:{tier:'silver',n:'备战口袋',ic:'▣',tags:['supplies'],
      d:'立即获得 1 次免费刷新，之后可在天赋或海克斯界面使用。',enter(){
        G.preparations.refreshLeft++;
        G.preparations.refreshMax=Math.max(G.preparations.refreshMax,G.preparations.refreshLeft);
      }},
    fleetSights:{tier:'silver',n:'轻步准具',ic:'↝',tags:['mobility','fire'],
      d:'移动速度 +8%，主弹散布 -18%。',apply:s=>{s.spdMul*=1.08;s.spreadMul*=.82;}},
    signalCache:{tier:'silver',n:'接力电标',ic:'ϟ',tags:['mech','summon'],
      d:'每次变身延长 2 秒，环绕机炮及哨戒炮开火间隔 -8%。',apply:s=>{s.mechDuration+=2;s.deployCooldown*=.92;}},

    tripleCadence:{tier:'gold',n:'三拍增幅',ic:'≋',tags:['fire'],
      d:'每第三次普攻的一枚主弹伤害 +65%。刺刀、技能和机甲射击不计入。'},
    followThrough:{tier:'gold',n:'起手连拍',ic:'➤',tags:['skill','fire'],
      d:'施放 Q/E 后，3 秒内前两次普攻各有一枚主弹伤害 +45%。重复施放重新计时，弹数不叠。'},
    staticPierce:{tier:'gold',n:'贯击响雷',ic:'⌁',tags:['pierce','control'],
      d:'每次普攻的一枚主弹从第二个命中目标开始，生效时眩晕该目标 0.72 秒。共用 1 秒间隔。'},
    thermalClamp:{tier:'gold',n:'寒焰阀',ic:'❄',tags:['burn','control'],
      d:'每次普攻的一枚主弹命中已灼烧的目标，造成有效伤害时附加 39% 减速，持续 1.6 秒。'},
    marchingCell:{tier:'gold',n:'行军线圈',ic:'↝',tags:['mobility','mech','skill'],
      d:'驾驶员每走 155 距离充能 7 点。机甲锁定时改为 Q/E 各返还 0.85 秒。'},
    relayNest:{tier:'gold',n:'协同令旗',ic:'◉',tags:['summon','skill'],
      d:'每 7 秒额外部署 1 座哨戒炮。施放 Q/E 时，在场的机炮及哨戒炮立即准备开火，下一发伤害 +34%。间隔 5 秒。',
      apply:s=>{s.turret++;}},
    afterGuard:{tier:'gold',n:'破盾滑步',ic:'⬡',tags:['guard','mobility'],
      d:'立即获得 1 层护盾。最后一层盾被击破时，移动速度 +30%，持续 2.8 秒。每 6 秒最多一次。',
      enter:()=>{G.shield++;}},

    supercritical:{tier:'prism',n:'炽霜临界',ic:'✷',tags:['burn','control'],
      d:'弹丸附加一级灼烧及冻结。每次普攻的一枚主弹命中已灼烧且减速的敌人后，向 90 范围内最多 3 名其他敌人各造成 24 基础伤害。间隔 1.4 秒。',
      apply:s=>{s.burn++;s.freeze++;}},
    phaseStride:{tier:'prism',n:'游弋贯星',ic:'⤢',tags:['mobility','pierce'],
      d:'移动速度 +12%。驾驶员每走 205 距离，补满下一至两次普攻的主弹贯穿充能，每发穿透 +3。',
      apply:s=>{s.spdMul*=1.12;}},
    pursuitCrit:{tier:'prism',n:'追光猎手',ic:'✧',tags:['crit','mobility','fire'],
      d:'普攻主弹造成有效暴击时，移动速度 +35%、普攻射速 +28%，持续 2 秒。间隔 2.4 秒。'},
    siegeHive:{tier:'prism',n:'蜂群齐射',ic:'◉',tags:['summon','fire'],
      d:'增加 1 台环绕机炮。机炮或哨戒炮的直接弹丸造成有效伤害时，补满下一至三次普攻主弹的火力，每发伤害 +42%。间隔 2.2 秒。',
      apply:s=>{s.drone++;}},
    ejectSalvo:{tier:'prism',n:'退场超载',ic:'ϟ',tags:['mech','skill','fire'],
      d:'机甲自然退场时退还 Q/E 各自剩余冷却的一半，随后 5 秒内前 5 次普攻各有一枚主弹伤害 +58%。',
      risk:'机甲锁定时，改为施放 Q/E 后 5 秒内前 3 次主弹伤害 +40%，间隔 4 秒。'},
    wardPulse:{tier:'prism',n:'逆序护航',ic:'⬢',tags:['guard','control'],
      d:'立即补足 2 层护盾。最后一层盾被击破时，145 范围内最多 3 名敌人各受 28 基础伤害，减速 65% 持续 2.4 秒。间隔 7 秒。',
      enter:()=>{G.shield=Math.max(G.shield,2);}},
    salvageSignal:{tier:'prism',n:'战场回收线',ic:'◇',tags:['supplies','control'],
      d:'累计击破 7 名计分敌人后，掉落 1 枚电磁脉冲战术道具。每 14 秒最多生成 1 枚，冷却中最多存到 7 次击破。'}
  };

  const primaryIds=['longSight','tripleCadence','followThrough','staticPierce','thermalClamp',
    'supercritical','phaseStride','pursuitCrit','siegeHive','ejectSalvo'];
  const emptyState=Object.freeze({});
  const has=id=>HEXES.has(id);
  const status=()=>G.enhancements.expansion ??= {};
  const readStatus=()=>G.enhancements.expansion ?? emptyState;
  const active=(until)=>G.t<(until ?? -Infinity);
  function ready(id,interval){
    const times=G.enhancements.activations;
    if(G.t<(times[id] ?? -Infinity)+interval) return false;
    times[id]=G.t;
    return true;
  }

  function refund(q){
    G.wcd=Math.max(0,G.wcd-q);
    G.ccd=Math.max(0,G.ccd-q);
  }

  function move(distance,dt,moving){
    const state=status();
    if(has('steadyRest')) state.still=moving?0:(state.still||0)+dt;
    if(G.mechT>0 || distance<=0) return;
    if(has('marchingCell')){
      state.march=(state.march||0)+distance;
      if(state.march>=march.meters){
        state.march-=march.meters;
        if(G.st.mechLocked) refund(march.refund);
        else addEnergy(march.energy);
      }
    }
    if(has('phaseStride')){
      state.stride=(state.stride||0)+distance;
      if(state.stride>=stride.meters){
        state.stride-=stride.meters;
        state.strideShots=stride.rounds;
      }
    }
  }

  function rate(){
    const state=readStatus();
    return (has('steadyRest') && state.still>=.65 ? 1.19 : 1) *
      (has('pursuitCrit') && active(state.huntUntil) ? hunter.rate : 1);
  }

  function speed(){
    const state=readStatus();
    return (has('pursuitCrit') && active(state.huntUntil) ? hunter.speed : 1) *
      (has('afterGuard') && active(state.slideUntil) ? 1.3 : 1);
  }

  function peekShot(p){
    if(!primaryIds.some(has)) return null;
    const s=readStatus();
    const nextCadence=has('tripleCadence') ? ((s.cadence||0)+1)%cadence.every : null;
    const useFollow=has('followThrough') && active(s.followUntil) && s.followShots>0;
    const useStride=has('phaseStride') && s.strideShots>0;
    const useHive=has('siegeHive') && s.hiveShots>0;
    const useExit=has('ejectSalvo') && active(s.exitUntil) && s.exitShots>0;
    const power=(nextCadence===0 ? cadence.power : 1) * (useFollow ? follow.power : 1) *
      (useHive ? hive.power : 1) * (useExit ? s.exitPower : 1);
    return {power,pierce:useStride ? stride.pierce : 0,x:p.x,y:p.y,long:has('longSight') ? longSight : null,
      nextCadence,useFollow,useStride,useHive,useExit};
  }

  function commitShot(shot){
    if(!shot) return;
    const s=status();
    if(shot.nextCadence!==null) s.cadence=shot.nextCadence;
    if(shot.useFollow) s.followShots--;
    if(shot.useStride) s.strideShots--;
    if(shot.useHive) s.hiveShots--;
    if(shot.useExit) s.exitShots--;
  }

  function contactPower(b){
    const mark=b.hexPrimary;
    return mark?.long && d2(b.x,b.y,mark.x,mark.y)>=mark.long.range**2 ? 1+mark.long.bonus : 1;
  }

  function nearest(x,y,radius,except){
    return projectileTargets().filter(e=>e!==except && !e.noReward && projectileTargetActive(e) &&
      d2(x,y,e.x,e.y)<=radius**2 && FieldMaps.lineOpen(x,y,e.x,e.y))
      .sort((a,b)=>d2(x,y,a.x,a.y)-d2(x,y,b.x,b.y)).slice(0,3);
  }

  function chill(e,amount,time){
    e.slowAmt=Math.max(e.slowAmt||0,amount);
    e.slowT=Math.max(e.slowT||0,time);
  }

  function pulse(x,y,r,damage,color,skip,slow=0){
    G.rings.push({x,y,r:4,max:r,life:.3,maxLife:.3,col:color,w:2});
    for(const e of nearest(x,y,r,skip)){
      if(!projectileTargetActive(e)) continue;
      const opt={hexSecondary:true};
      if(e===G.boss) damageBoss(e,damage,false,e.x,e.y,opt);
      else applyDamage(e,damage,false,e.x,e.y,opt);
      if(!e.dead && slow) chill(e,slow,2.4);
    }
  }

  function onDamage(target,crit,opt){
    if(!target || target.noReward) return;
    if(opt?.hexCompanion && has('siegeHive') && ready('siegeHive',hive.interval)) status().hiveShots=hive.rounds;
    if(!opt?.hexPrimary) return;
    const burning=target.burnT>0 && !target.venom;
    const frozen=target.slowT>0 && target.slowAmt>0;
    if(crit && has('pursuitCrit') && ready('pursuitCrit',hunter.interval)) status().huntUntil=G.t+hunter.seconds;
    if(opt.pierceIndex>0 && has('staticPierce') && ready('staticPierce',1)) target.stun=Math.max(target.stun||0,.72);
    if(burning && has('thermalClamp')) chill(target,.39,1.6);
    if(burning && frozen && has('supercritical') && ready('supercritical',1.4))
      pulse(target.x,target.y,90,24,'#debaff',target);
  }

  function companionShot(unit){
    if(!unit.hexCharged) return 1;
    unit.hexCharged=false;
    return has('relayNest') ? relay.power : 1;
  }

  function armExit(rounds,power){
    const s=status();s.exitUntil=G.t+exit.seconds;s.exitShots=rounds;s.exitPower=power;
  }

  function onSkill(){
    const s=status();
    if(has('followThrough')){s.followUntil=G.t+follow.seconds;s.followShots=follow.rounds;}
    if(has('relayNest') && (G.drones.length || G.turrets.length) && ready('relayNest',relay.interval)){
      for(const unit of [...G.drones,...G.turrets]){unit.cd=0;unit.hexCharged=true;}
    }
    if(has('ejectSalvo') && G.st.mechLocked && ready('ejectLocked',exit.interval)) armExit(exit.lockedRounds,exit.lockedPower);
  }

  function onShieldBlock(){
    if(G.shield!==0) return;
    if(has('afterGuard') && ready('afterGuard',6)) status().slideUntil=G.t+2.8;
    if(has('wardPulse') && ready('wardPulse',7)) pulse(G.p.x,G.p.y,145,28,'#aee7ff',null,.65);
  }

  function onMechExpiry(){
    if(!has('ejectSalvo')) return;
    G.wcd*=1-exit.refund;G.ccd*=1-exit.refund;
    armExit(exit.rounds,exit.power);
  }

  function onKill(enemy){
    if(!enemy || !has('salvageSignal')) return;
    const s=status();
    s.salvage=Math.min(7,(s.salvage||0)+1);
    if(s.salvage<7 || !ready('salvageSignal',14)) return;
    s.salvage=0;
    dropItem(enemy.x,enemy.y,'emp');
  }

  return {cards,move,rate,speed,peekShot,commitShot,contactPower,onDamage,companionShot,onSkill,onShieldBlock,onMechExpiry,onKill};
})();
