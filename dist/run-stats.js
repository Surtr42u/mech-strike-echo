/* Snapshot the live combat values only while the pause panel is open. */
function showRunStats(){
  if(G.mode !== 'pause') return;
  const s=G.st, p=G.p, w=WEP(), mech=currentMech(), volley=weaponVolley(w,s);
  const format=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2});
  const n=value=>format.format(value);
  const pct=value=>n(value*100)+'%';
  const mult=value=>'×'+n(value);
  const cd=(remaining,total)=>n(Math.max(0,remaining))+' / '+n(total)+' 秒';
  const shot=crit=>calcDamage(volley.damage,'player',null,{crit,pct:volley.pct}).dmg;
  function group(title,rows){
    const section=node('section','run-stat-group'), list=node('dl');
    section.append(node('h3','',title),list);
    for(const [label,value] of rows){
      const row=node('div');row.append(node('dt','',label),node('dd','',String(value)));list.append(row);
    }
    return section;
  }
  const mechState=s.mechLocked?'机甲锁定':G.mechT>0?'变身中 · 剩余 '+n(G.mechT)+' 秒':'能量 '+n(G.energy)+' / 100';
  const mechRows=[['机甲状态',mechState]];
  if(!s.mechLocked){
    mechRows.push(['单次变身',n(mech.time+s.mechDuration)+' 秒'],['机甲攻击倍率',mult(mechAttackPower())],
      ['机甲技冷却',cd(G.mechCd,mech.skill.cooldown)]);
  }
  byId('runStatLoadout').textContent=SKIN().name+' · '+w.n+' · '+mech.name;
  byId('runStatGroups').replaceChildren(
    group('驾驶员主武器',[
      ['单弹命中 / 暴击',shot(false)+' / '+shot(true)],['暴击率 / 倍率',pct(s.crit)+' / '+mult(s.critMul)],
      ['每秒开火',n(1/volley.interval)+' 次'],['每次主弹',volley.count+' 枚'],
      ['额外穿透目标',volley.pierce+' 个'],['自动瞄准射程',n(weaponReach(w,s))+' 单位']
    ]),
    group('技能与弹幕',[
      ['技能强度',mult(scaleSkill(1))],['武器技冷却',cd(G.wcd,abilityCooldown(w.sk.cd))],
      ['驾驶员必杀冷却',cd(G.ccd,abilityCooldown(SKIN().act.cd))],['弹幕伤害倍率',mult(s.barragePower)],
      ['每次附加散射',volley.barrageCount+' 枚'],
      ['散射单弹命中',volley.barrageCount ? calcDamage(volley.barrageDamage,'player',null,{crit:false}).dmg : '未启用']
    ]),
    group('生存与移动',[
      ['生命',n(p.hp)+' / '+n(p.maxHp)],['护盾',G.shield+' 层'],['护甲减伤',pct(clamp(s.armor,0,ARMOR_LIMIT))],
      ['护甲后承伤',mult(incomingDamageFactor(s))],['当前移速',n(currentMoveSpeed(p,s))+' 单位/秒']
    ]),
    group(mech.name+'机甲',mechRows)
  );
  byId('runStatsDialog').showModal();
}
