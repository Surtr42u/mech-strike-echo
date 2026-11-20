/* The Echo relay is a field objective. All progress belongs to the current sortie. */
const CampaignStory = (() => {
  const coreName = '稳压核心';
  const coreHealth = 16;
  const linerName = '矿工缓冲衬板';
  const linerArmor = .12;
  const sectors = [
    {
      name:'避雷棚信标', color:'#c9f4a8', position:[.76,.37],
      brief:'车队困在虚空核心外，沿旧信标接力线打通撤离路。',
      note:'合闸下井，肃清四间厅室、击破排风守卫，再启动排风。尘散后沿地表灯标前往霓虹雨夜。',
      repaired:'尘暴已停。露出的地表灯标指向霓虹雨夜的避雷棚。',
      ready:'碾压者已倒下。地表信标接通，去霓虹雨夜给下一站送电。',
      fallback:'从碾压者残骸读到避雷棚坐标。可下井排风，也可走残骸旁的备用跃点。',
      fromFallback:'残骸上的检修坐标已同步。', backup:'避雷棚检修跃点'
    },
    {
      name:'矿场接力口', color:'#8aeee4', position:[.74,.31],
      brief:'引雷塔能保护避雷棚，还能给冰封矿场的地热泵送电。',
      note:'接通引雷塔，避雷棚挡雷，三道落雷转向敌群。塔电接通矿场接力口。',
      repaired:'避雷棚已接地，三道落雷转向敌群。塔电已送往矿场。',
      ready:'蜂后已击破。沿通电的接力口去矿场，地热泵正在待命。',
      fallback:'蜂后的母舰记录着矿场维修频段。可接通引雷塔，也可从备用跃点进入矿场。',
      fromFallback:'蜂后的维修频段已同步。', backup:'矿场维修跃点'
    },
    {
      name:'解冻货运轨', color:'#ffe29c', position:[.65,.51],
      brief:'冰墙封住了驶向熔岩工厂的货轨。开地热阀解冻。',
      note:'开地热阀融开冰墙。乘升降台下冻晶矿井，开地热架桥阀过断崖回收衬板。',
      repaired:'货轨已解冻。南侧升降台能下冻晶矿井，启动架桥阀去过桥回收柜。',
      ready:'货轨通向熔岩工厂。冻晶矿井的升降台仍可使用。',
      fallback:'霜牙的巢穴露出排水井入口。可融开东侧冰墙，也可走排水井跃点。',
      fromFallback:'排水井坐标已同步。', backup:'工厂排水井跃点'
    },
    {
      name:'冷却槽转接站', color:'#8cebd3', position:[.72,.46],
      brief:'炉温太高，虚空方向的中继已停。释放冷却液恢复中继。',
      note:'打开冷却阀压制附近熔池十秒，恢复通往虚空核心的中继。',
      repaired:'转接炉已泄压，中继恢复。阀区十秒内持续清除熔池。',
      ready:'工厂已清场。冷却槽转接站已通往虚空核心。',
      fallback:'熔心的隔热管道可以通行。可先给转接炉泄压，也可走隔热跃点。',
      fromFallback:'熔心的隔热管道坐标已同步。', backup:'虚空隔热跃点'
    },
    {
      name:'车队撤离航道', color:'#dbbaff', position:[.84,.37],
      brief:'车队就在裂隙对侧。用双锚校准航道，再击破虚空核心的首领。',
      note:'用相位锚实地跃迁，校准车队撤离航道。双锚可往返，冷却九秒。',
      repaired:'双锚校准完成。车队已收到航道坐标，等首领击破再撤离。',
      repairedLate:'双锚校准完成。车队已收到航道坐标，进入撤离光环会合。',
      ready:'虚空首领已击破。沿双锚校准的航道与车队会合。',
      fallback:'虚空之眼的残骸能发出近程信号。可校准双锚带车队撤离，也可由应急信标脱离。',
      backup:'应急撤离信标'
    }
  ];
  const routeNotes = sectors.map(sector => sector.note);
  let log = [], transmission, state, hasCore = false, hasLiner = false;

  function transmit(message){
    transmission = {message,until:G.t+5.5};
    log.push({sector:SCENES[G.stage].name,message});
  }

  function reset(){
    log = [];
    transmission = state = null;
    hasCore = hasLiner = false;
    byId('fieldLog').open = false;
  }

  function begin(stage){
    const sector = sectors[stage];
    const fallback = state?.defeated && !state.repaired ? state.sector.fromFallback + ' ' : '';
    const [x,y] = sector.position;
    state = {sector,repaired:false,defeated:false,beacon:FieldMaps.safePoint(ARENA.w*x,ARENA.h*y,26)};
    transmit(fallback + sector.brief);
  }

  function claimCore(){
    if(hasCore) return false;
    hasCore = true;
    recalc();
    transmit(coreName+'已装入机体。本局生命上限 +'+coreHealth+'。'+(repaired()?'返回升降机。':'继续沿黄线去排风配电台。'));
    return true;
  }

  function coreBonus(){ return hasCore ? coreHealth : 0; }
  function linerBonus(){ return hasLiner ? linerArmor : 0; }

  function claimLiner(){
    if(hasLiner) return false;
    hasLiner = true;
    recalc();
    transmit(linerName+'已装配。本局护甲 +12 个百分点。沿轨返回升降台。');
    return true;
  }

  function equipment(){
    const equipped = [];
    if(hasCore) equipped.push({id:'core',name:coreName,summary:'生命上限 +'+coreHealth});
    if(hasLiner) equipped.push({id:'liner',name:linerName,summary:'护甲 +12 个百分点'});
    return equipped;
  }
  function repaired(){ return state?.repaired ?? false; }

  function openRoute(){
    const {sector,repaired,beacon,defeated} = state;
    const target = repaired ? beacon : defeated;
    G.portal = {
      ...target,t:0,name:repaired ? sector.name : sector.backup,color:repaired ? sector.color : '#ffc184',
      mustExit:!FieldMaps.underground() && d2(G.p.x,G.p.y,target.x,target.y)<34**2
    };
  }

  function complete(){
    if(state.repaired) return;
    state.repaired = true;
    const {sector,defeated} = state;
    if(defeated) openRoute();
    transmit(defeated && sector.repairedLate ? sector.repairedLate : sector.repaired);
  }

  function clear(boss){
    state.defeated = TreasureSites.clearOfChest(FieldMaps.safePoint(boss.x,boss.y,26));
    openRoute();
    transmit(state.repaired ? state.sector.ready : state.sector.fallback);
  }

  function beacon(){
    if(!state?.repaired || G.portal || FieldMaps.underground()) return null;
    return {...state.beacon,name:state.sector.name+' · 待肃清',color:state.sector.color};
  }

  function visiblePortal(){ return FieldMaps.underground() ? null : G.portal; }

  function approachRoute(){
    const portal = visiblePortal();
    if(!portal) return '';
    return '前往' + portal.name + (portal.mustExit ? ' · 先离开光环' : '');
  }

  function drawBeacon(){
    const target = beacon();
    if(!target) return;
    const x = SX(target.x), y = SY(target.y);
    if(x < -70 || x > VW+70 || y < -30 || y > VH+50) return;
    ctx.save();
    ctx.strokeStyle = target.color;
    ctx.fillStyle = '#172c30';
    ctx.lineWidth = 1.8;
    ctx.beginPath();ctx.ellipse(x,y,19,7,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-5,y-3);ctx.lineTo(x,y-21);ctx.lineTo(x+5,y-3);ctx.stroke();
    ctx.fillStyle = target.color;
    ctx.fillRect(x-3,y-23,6,4);
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#10191b';
    ctx.strokeText(target.name,x,y-30);ctx.fillText(target.name,x,y-30);
    ctx.restore();
  }

  function paintHud(){
    const gear = byId('hudFieldGear');
    gear.hidden = !hasCore && !hasLiner;
    if(!gear.hidden) putText(gear, [hasCore ? coreName+' +'+coreHealth+' 生命' : '',
      hasLiner ? '缓冲衬板 +12% 护甲' : ''].filter(Boolean).join(' · '));
    const radio = byId('fieldTransmission');
    radio.hidden = !transmission || G.t >= transmission.until;
    if(!radio.hidden) putText(radio,'回声 · '+transmission.message);
  }

  function paintLog(){
    byId('fieldLog').open = false;
    const status = equipment().map(item=>item.name+' · 本局'+item.summary).join(' / ') || '未回收战役装备';
    putText(byId('fieldGearLog'),status);
    const items = log.slice().reverse().map(({sector,message})=>node('li','',sector+' · '+message));
    byId('fieldLogEntries').replaceChildren(...items);
  }

  function ending(){
    return state.repaired ? '双锚已校准，回声车队沿航道撤离。' : '应急信标已接通，驾驶员脱离虚空核心。';
  }

  return {routeNotes,reset,begin,transmit,claimCore,coreBonus,claimLiner,linerBonus,equipment,repaired,complete,clear,
    beacon,visiblePortal,approachRoute,drawBeacon,paintHud,paintLog,ending};
})();
