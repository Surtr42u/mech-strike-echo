/* 永久战备在出击时实例化。消耗次数只存在于本局。 */
const PREPARATIONS = (function(){
  const lockDuration = 2;
  const energyPerLevel = 25;
  const starterItem = 'emp';
  const specs = {
    refresh: { name:'选牌刷新', icon:'⇄', label:'每局刷新次数', grades:[0,1,2],
      desc:'重选普通或阶段大强化时，可按 R 或点刷新。至少出现一张新牌时才消耗次数。',
      value:level => level + ' 次' },
    lock: { name:'应急锁血', icon:'⛨', label:'每局致死保护', grades:[2],
      desc:'每局首次受到致死伤害时保留 1 点生命，并无敌 2 秒。优先于复活。',
      value:level => level ? '1 次' : '未解锁' },
    precharge: { name:'机甲预充', icon:'ϟ', label:'开局机甲能量', grades:[0,1,2],
      desc:'出击时自动预充机甲能量，每级提高 25 点。',
      value:level => level * energyPerLevel + '%' },
    supply: { name:'战术补给', icon:'▤', label:'开局背包补给', grades:[1],
      desc:'每次出击在第 1 格预装电磁脉冲，可清空敌弹并麻痹敌人。按 1 或点背包格使用。',
      value:level => level ? '电磁脉冲 ×1' : '未解锁' },
    hexDraft: { name:'海克斯扩容', icon:'◇', label:'每局海克斯选取', grades:[3,4],
      desc:'每局多获得 1 次海克斯五选一。选牌次数与「高阶海克斯」叠加后，后期的构筑会更完整。',
      value:level => level ? '+' + level + ' 次' : '未解锁' }
  };

  function read(raw){
    const levels = {};
    for(const [id,spec] of Object.entries(specs)){
      const level = raw?.[id];
      if(Number.isInteger(level) && level > 0) levels[id] = Math.min(level,spec.grades.length);
    }
    return levels;
  }

  function rows(){
    return Object.entries(specs).map(([id,spec]) => {
      const level = PROF.preparations[id] ?? 0;
      const costs = spec.grades.map(grade => MODULE_COSTS[grade]);
      return upgradeRow(id,spec,level,costs,() => buyUpgradeLevel(PROF.preparations,id,costs));
    });
  }

  function startRun(){
    const levels = G.growth.preparations;
    G.preparations = {
      refreshMax:levels.refresh || 0, refreshLeft:levels.refresh || 0,
      lockReady:!!levels.lock, lockUntil:0
    };
    if(levels.precharge && !G.st.mechLocked) G.energy = levels.precharge * energyPerLevel;
    if(levels.supply) G.bag[0] = starterItem;
  }

  function tryLock(){
    const p = G.p, state = G.preparations;
    if(p.hp > 0 || !state.lockReady) return false;
    state.lockReady = false;
    state.lockUntil = G.t + lockDuration;
    p.hp = 1;
    p.inv = Math.max(p.inv,lockDuration);
    G.selfBurnT = 0;
    floatText(p.x,p.y,'应急锁血 · 1 HP','#9fffd1',true);
    banner('应急锁血','保留 1 点生命 · 2 秒无敌',1.65);
    SFX.lvl();
    return true;
  }

  function protectedFromSelfBurn(){
    return G.t < G.preparations.lockUntil;
  }

  function lockStatus(){
    const state = G.preparations;
    return state.lockReady ? '应急锁血可用' : state.lockUntil > 0 ? '应急锁血已用' : '';
  }

  return { read, rows, startRun, tryLock, protectedFromSelfBurn, lockStatus };
})();
