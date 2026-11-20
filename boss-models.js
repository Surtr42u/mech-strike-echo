'use strict';

const BossModels = (() => {
  // Render at art resolution and reuse the frame while the display redraws.
  const tile = document.createElement('canvas');
  tile.width = 116;
  tile.height = 112;
  const g = tile.getContext('2d');
  const INK = '#141626';
  const TAU = Math.PI * 2;
  const paints = {
    steel: ['#455567', '#8195a3', '#293443'],
    brass: ['#8d6c41', '#d8ba72', '#4d3e33'],
    sand: ['#9c5f39', '#db9e60', '#573629'],
    rubber: ['#363846', '#626271', '#232332'],
    carrier: ['#365e79', '#7cafbd', '#20334e'],
    mirror: ['#487371', '#b8d9cc', '#2a464e'],
    slate: ['#365975', '#7aabc2', '#25344f'],
    ice: ['#6194b1', '#bce5e9', '#3b557d'],
    furnace: ['#753c37', '#b46a4f', '#4d2b34'],
    iron: ['#484756', '#82808b', '#2f2a3a'],
    voidarmor: ['#4a3560', '#8d6baa', '#2e2141'],
    hivehull: ['#7b86ad', '#b0bce2', '#4d5884'],
    frosthull: ['#a6c7ce', '#d8f1f5', '#6085a6']
  };
  const lamps = {
    bulwark: ['#ffcc64', '#ff8a4d', '#fff0bd'],
    crusher: ['#ffad52', '#ff7145', '#fff3ad'],
    hive: ['#66dfff', '#f37ac4', '#fff0fa'],
    prism: ['#81e5ce', '#f3bb83', '#fffce0'],
    frost: ['#8ef0ff', '#a68afa', '#edffff'],
    molten: ['#ff9d42', '#ff6334', '#fff3ae'],
    void: ['#d7a0ff', '#f972d5', '#fff1ff']
  };

  /* ── 体积辅助 ──
     · 调色板在初始化时补两层：顶部轮缘高光 p[3]、内构暗部 p[4]
     · bodyGrad 按「调色板 + 高度」缓存渐变对象，画质 0 时直接退化为平涂
     · 所有渐变在 translate 后的局部坐标里填充，不依赖部件绝对位置 */
  let QUAL = 2;
  function mix(a, b, t){
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const r = Math.round((x >> 16 & 255) + ((y >> 16 & 255) - (x >> 16 & 255)) * t);
    const gg = Math.round((x >> 8 & 255) + ((y >> 8 & 255) - (x >> 8 & 255)) * t);
    const bb = Math.round((x & 255) + ((y & 255) - (x & 255)) * t);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bb).toString(16).slice(1);
  }
  let palId = 0;
  for(const k in paints){
    const p = paints[k];
    p[3] = mix(p[1], '#ffffff', .36);
    p[4] = mix(p[0], '#0b0d17', .46);
    p.id = ++palId;
  }
  const gradCache = new Map();
  function bodyGrad(p, h){
    if(QUAL < 1) return p[0];
    const hh = Math.max(4, Math.round(h));
    const key = p.id * 128 + (hh & 127);
    let gr = gradCache.get(key);
    if(!gr){
      // 固定在单位变换下创建，实际填充时再跟随 translate，避免缓存串位
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      gr = g.createLinearGradient(0, 0, 0, hh);
      gr.addColorStop(0, p[3]);
      gr.addColorStop(.16, p[1]);
      gr.addColorStop(.58, p[0]);
      gr.addColorStop(1, p[4]);
      g.restore();
      gradCache.set(key, gr);
    }
    return gr;
  }
  /* 多边形裁剪 + 竖向渐变：主装甲不再是一块纯色 */
  function shell(p, y0, y1, ...pts){
    if(QUAL < 1){
      poly(p[0], ...pts);
      return;
    }
    g.save();
    g.beginPath();
    g.moveTo(Math.round(pts[0]), Math.round(pts[1]));
    for(let i = 2; i < pts.length; i += 2) g.lineTo(Math.round(pts[i]), Math.round(pts[i + 1]));
    g.closePath();
    g.clip();
    g.translate(0, y0);
    g.fillStyle = bodyGrad(p, y1 - y0);
    g.fillRect(-70, 0, 140, Math.max(6, y1 - y0));
    g.restore();
  }
  function alphaRect(c, x, y, w, h, a){
    g.globalAlpha = a;
    rect(c, x, y, w, h);
    g.globalAlpha = 1;
  }
  /* 阶段切换时的核心辉光：短促、局部，不做全屏闪白 */
  function glow(x, y, rx, ry, c, a){
    g.globalAlpha = a;
    g.fillStyle = c;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  function crack(c, ...pts){
    g.strokeStyle = c;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(Math.round(pts[0]), Math.round(pts[1]));
    for(let i = 2; i < pts.length; i += 2) g.lineTo(Math.round(pts[i]), Math.round(pts[i + 1]));
    g.stroke();
  }
  function hose(x1, y1, cx, cy, x2, y2, c){
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); g.stroke();
    g.strokeStyle = c;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(cx, cy, x2, y2); g.stroke();
    rect('#2b2733', Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
  }
  function ember(x, y, t, seed, c){
    if(QUAL < 1) return;
    const k = Math.floor(t * 14 + seed) % 5;
    g.globalAlpha = .55 - k * .09;
    rect(c, x, y - k * 4, 2, 3);
    g.globalAlpha = 1;
  }
  function steam(x, y, t, seed){
    if(QUAL < 1) return;
    const k = Math.floor(t * 8 + seed) % 6;
    g.globalAlpha = .26 - k * .032;
    rect('#cbd3d8', x + (k % 2), y - k * 3, 2 + (k > 3 ? 1 : 0), 3);
    g.globalAlpha = 1;
  }

  function rect(c, x, y, w, h){
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function poly(c, ...p){
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(Math.round(p[0]), Math.round(p[1]));
    for(let i = 2; i < p.length; i += 2) g.lineTo(Math.round(p[i]), Math.round(p[i + 1]));
    g.closePath();
    g.fill();
  }
  function bar(c, w, x, y, toX, toY){
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(Math.round(x), Math.round(y));
    g.lineTo(Math.round(toX), Math.round(toY));
    g.stroke();
  }
  function plate(x, y, w, h, d, p){
    poly(INK, x-1,y-1, x+d-1,y-d-1, x+w+d+1,y-d-1, x+w+d+1,y+h-d+1, x+w+1,y+h+1, x-1,y+h+1);
    poly(p[1], x,y, x+d,y-d, x+w+d,y-d, x+w,y);
    poly(p[2], x+w,y, x+w+d,y-d, x+w+d,y+h-d, x+w,y+h);
    /* 正面：竖向明暗。低画质不建渐变，靠 1px 轮缘维持体积 */
    if(QUAL > 0 && h >= 6){
      g.save();
      g.translate(x, y);
      g.fillStyle = bodyGrad(p, h);
      g.fillRect(0, 0, w, h);
      g.restore();
    } else {
      rect(p[0], x, y, w, h);
    }
    rect(p[3], x, y, w, 1);
    rect(p[4], x, y+h-2, w, 2);
    if(QUAL > 0 && w >= 8 && h >= 8) alphaRect(p[3], x+1, y+1, w-2, 1, .30);
  }
  function piston(x, y, dx, dy, w, p){
    bar(INK, w+4, x,y, dx,dy);
    bar(p[2], w, x,y, dx,dy);
    bar(p[1], 2, x,y, dx,dy);
    const mx = x+(dx-x)*.48, my = y+(dy-y)*.48;
    bar(p[0], w+2, x,y, mx,my);
    rect(p[2], mx-2,my-2,4,4);
  }
  function rivet(x, y, c){
    rect(INK,x,y,3,3);
    rect(c,x,y,2,1);
  }
  function slots(x, y, n, c, step=4){
    for(let i = 0; i < n; i++) rect(c,x+i*step,y,2,4);
  }
  function crystal(x, y, rise, w, lean, lit){
    const tip = x+lean, edge = x+w;
    poly(INK,x-1,y+1, tip-1,y-rise-1, tip+4,y-rise, edge+2,y-9, edge+4,y, x+w*.5,y+5);
    poly('#4d739e',x,y, tip,y-rise, edge,y-9, edge+2,y, x+w*.5,y+4);
    poly(lit,x,y, tip,y-rise, x+w*.54,y-7, x+w*.5,y+4);
    poly('#dfedf3',tip,y-rise, tip+3,y-rise+2, x+w*.54,y-7);
    poly('#355375',x+w*.54,y-7, edge,y-9, edge+2,y, x+w*.5,y+4);
  }

  function bulwark(s){
    const { t, p, wind, fire, light, hit, phaseFlash } = s;
    const brace = Math.round(wind*6 - fire*2);
    const ram = s.action === 'guardRam';
    const body = Math.round(Math.sin(t*6)*1.3) + brace;
    function foot(x, y, back){
      const stride = Math.sin(t*8 + (back ? 0 : Math.PI)) * 3 * (1-wind);
      piston(x-3,-27+body, x+stride,y-8, 9, paints.steel);
      plate(x-8+stride,y-8,15,8,4,paints.brass);
      rect('#d6b17a',x-8+stride,y-3,15,2);
      if(wind > .24 || fire > 0){
        rect('#35333b',x-4+stride,y-10,8,11);
        rect(light,x-2+stride,y-2,4,4);
      }
    }
    foot(16,-10,true);
    foot(-20,1,false);
    /* 后层：背包动力组与散热塔。暗一档、随呼吸轻微错位，先画形成前后关系 */
    const sway = Math.round(Math.sin(t*2.4)*1.2 + wind*2);
    poly(INK, -40-sway,-62+body, -25-sway,-69+body, -11-sway,-56+body, -14-sway,-33+body, -34-sway,-29+body);
    poly(paints.iron[2], -38-sway,-60+body, -25-sway,-66+body, -14-sway,-55+body, -17-sway,-36+body, -33-sway,-32+body);
    poly(paints.iron[1], -37-sway,-59+body, -25-sway,-64+body, -16-sway,-55+body, -23-sway,-52+body);
    piston(-33-sway,-55+body, -38-sway,-73+body, 5, paints.iron);
    rect(paints.iron[3], -40-sway,-76+body, 5, 2);
    if(p) steam(-39-sway,-78+body,t,1);
    plate(-27,-48+body,36,29,7,paints.steel);
    plate(-20,-59+body,19,15,5,paints.brass);
    rect('#292739',-16,-54+body,15,6);
    rect(p > 1 ? '#6b481d' : '#3a3040',-14,-52+body,11,3);
    rect(light,-12,-53+body,9,2);
    if(QUAL > 0) alphaRect(light,-9,-52+body,4,1,.52);
    if(phaseFlash > 0) glow(-6,-49+body, 9, 8, light, .18*phaseFlash);
    if(p){
      // 破甲阶段：胸口裂缝、内构露出暖光
      crack('#1b1a26',-24,-47+body,-16,-40+body,-11,-42+body,-4,-33+body);
      crack('#1b1a26',-30,-38+body,-25,-32+body,-18,-34+body);
      if(p > 1) alphaRect(light,-22,-44+body,3,7,.35);
    }
    rivet(-21,-47+body,'#b6c9cc');
    piston(-23,-41+body,-33,-23+body,7,paints.brass);
    plate(-37,-29+body,13,17,4,paints.steel);

    // The front shield splits at its mount when the guard loses its armor.
    const x = Math.round(1 + wind*(ram ? 10 : 5) - hit*3 + fire*3);
    const y = -46 + body;
    plate(x-7,y+10,42,22,6,paints.steel);
    poly(INK,x-5,y-1, x+22,y-7-p*3, x+40+p*3,y+3, x+38,y+30, x+22,y+45, x-3,y+35);
    poly('#c1a879',x-3,y, x+22,y-5-p*3, x+39+p*3,y+4, x+25,y+10, x-2,y+14);
    poly('#554c44',x+25,y+10, x+39+p*3,y+4, x+36,y+29, x+22,y+43, x+23,y+32);
    poly('#8d7755',x-3,y, x+25,y+10, x+23,y+32, x+20,y+41, x-1,y+34);
    poly('#463b3d',x+2,y+8, x+19,y+14, x+17,y+31, x+2,y+29);
    /* 盾面上缘/左缘轮缘光，薄薄一层就够，避免整块发白 */
    bar('#e2cd98',1, x-2,y+1, x+21,y-3-p*3);
    bar('#e2cd98',1, x+23,y-3-p*3, x+37+p*3,y+6);
    bar('#6a5a41',1, x-1,y+33, x+20,y+40);
    if(QUAL > 0) alphaRect('#f3e3b4', x+3, y+2, 15, 1, .32);
    if(p) crack('#2e2928', x+9,y+15, x+6,y+24, x+11,y+32);
    for(let i = 0; i < 3; i++){
      const fy = y + 14 + i*5;
      poly(i===Math.floor(t*6)%3 || wind>.3 ? light : '#b19869',x+4,fy-3,x+16,fy+1,x+16,fy+3,x+4,fy);
    }
    rivet(x+27,y+12,'#d6bc83');
    rivet(x+26,y+25,'#d6bc83');
    if(p){
      poly(INK,x+39,y+7,x+26,y+22,x+33,y+22,x+16,y+41,x+21,y+28,x+16,y+28,x+30,y+9);
      bar(light,2,x+25,y+25,x+19,y+35);
      rect('#8a7460',x-1,y+4,4,8);
    }
  }

  function crusher(s){
    const { t, p, wind, fire, light, hit, phaseFlash } = s;
    const rev = s.action === 'charge' && fire > 0;
    const bob = Math.round(Math.sin(t*4.2)*1.2*(1-wind*.6));
    const skew = Math.round(wind*3-fire*2+bob);
    const lift = Math.round(wind*7-fire*2);
    function track(x, y, span, back){
      poly(INK,x-5,y+5, x+4,y-2, x+span-5,y-2, x+span+3,y+5, x+span+3,y+16, x+span-6,y+20, x+1,y+20, x-5,y+14);
      poly(back ? '#46414b' : '#605052',x-2,y+5, x+5,y, x+span-6,y, x+span+1,y+5, x+span,y+14, x+span-6,y+18, x+1,y+18);
      rect('#302630',x+3,y+6,span-6,9);
      rect(back ? '#5d4e4a' : '#8c7361',x+5,y+5,span-11,1);
      const phase = Math.floor(t*(rev ? 45 : 22)) % 7;
      for(let i = 5; i < span - 7; i += 7){
        rect(back ? '#6b5650' : '#9c7f6a',x+i+phase,y+16,3,2);
        rect('#564b50',x+i,y+8,4,5);
      }
    }
    /* 后层：锅炉与排气管，压在履带和车体之后，让轮廓有厚度 */
    const puff = Math.round(Math.sin(t*2.6)*1.5);
    poly(INK,-38,-49+skew, -27,-55+skew, -13,-49+skew, -15,-30+skew, -36,-28+skew);
    poly('#3b3039',-35,-47+skew, -27,-52+skew, -16,-47+skew, -18,-33+skew, -34,-32+skew);
    poly('#5c4a44',-33,-46+skew, -27,-50+skew, -20,-46+skew, -27,-43+skew);
    piston(-31,-48+skew, -35,-67+skew, 5, paints.rubber);
    rect(p ? light : '#6a5550', -38+puff, -70+skew, 5, 3);
    if(p) steam(-39+puff, -73+skew, t, 3);
    track(-30,-26,56,true);
    plate(-36,-33+skew,58,20,8,paints.sand);
    track(-42,-19,64,false);
    plate(-43,-38+skew,18,12,5,paints.rubber);
    slots(-40,-35+skew,3,'#8d7b6d');
    plate(-24,-45+skew,34,14,6,paints.sand);
    if(p){
      // 装甲剥开：露出热水箱与散热鳍
      piston(-29,-38+skew,-37,-44+skew,6,paints.steel);
      plate(-46,-49+skew,13,8,4,paints.sand);
      rect('#40313a',-32,-44+skew,10,10);
      slots(-31,-43+skew,2,light);
      if(p > 1) alphaRect(light,-31,-46+skew,9,3,.22);
      crack('#2b2430',-22,-31+skew,-16,-25+skew,-9,-27+skew);
    }
    plate(-21,-53+skew,22,9,4,paints.rubber);
    rect('#261e2a',-17,-51+skew,15,5);
    rect(light,-16,-50+skew,13,2);
    if(QUAL > 0) alphaRect(light,-14,-49+skew,8,1,.45);
    if(phaseFlash > 0) glow(-27,-45+skew, 13, 10, light, .16*phaseFlash);
    piston(-10,-38+skew, 22,-31-lift, 7, paints.steel);
    piston(-9,-20, 26,-18-lift, 8, paints.steel);
    const x = 17 + Math.round(fire*4-hit*2), y = -34-lift;
    poly(INK,x-1,y+3, x+21,y-7, x+31,y-6, x+35,y+19, x+29,y+34, x+3,y+40, x-3,y+31);
    poly('#c1814c',x,y+4, x+22,y-5, x+29,y-4, x+24,y+5, x+9,y+11);
    poly('#a4673c',x+9,y+11, x+24,y+5, x+30,y-4, x+33,y+19, x+27,y+32, x+4,y+38, x+7,y+29);
    poly('#59404d',x+1,y+5, x+9,y+11, x+7,y+29, x+4,y+38, x-1,y+30);
    /* 铲刃上缘受光，刃口保持暗，避免整把刀发亮 */
    bar('#e3b184',1, x+1,y+2, x+21,y-6);
    bar('#e3b184',1, x+21,y-6, x+29,y-5);
    bar('#7e4b39',1, x+4,y+37, x+28,y+32);
    if(QUAL > 0) alphaRect('#ffdfae', x+2, y+6, 17, 1, .30);
    if(p) crack('#3a2a30', x+13,y+12, x+10,y+22, x+16,y+33);
    for(let i=0; i<4; i++){
      const tx = x+6+i*7, ty = y+31-i*2;
      poly('#d0a073',tx-3,ty,tx+2,ty-2,tx+3,ty+5,tx-2,ty+6);
    }
    bar('#d6a16a',1,x+11,y+13,x+23,y+8);
    bar('#7e4b39',1,x+9,y+26,x+24,y+20);
    if(p){
      bar(INK,3,x+30,y+8,x+12,y+22);
      bar(p>1 ? light : '#fba65f',2,x+12,y+22,x+24,y+20);
      rect(light,-40,-36+skew,5,3);
    }
    if(p>1){
      plate(-14,-56+skew,7,10,3,paints.rubber);
      plate(-37,-53,6,12,3,paints.rubber);
      rect(light,-13,-57+skew,8,2);
      if(fire){
        rect(light,-12,-61+skew,4,3);
        rect('#e8916a',-11,-66+skew,2,3);
      }
    }
  }

  function hive(s){
    const { t, p, wind, fire, light, phaseFlash } = s;
    const bay = s.action === 'spawnDrones';
    const beam = s.action === 'sweep' || s.action === 'sweepSpin';
    const open = Math.round(wind*(bay ? 11 : 7) + fire*(bay ? 12 : 5));
    const heave = Math.round(Math.sin(t*3)*4 + wind*3 - fire*4);
    g.translate(0, heave);
    const dark = '#242337', panel = '#4d5286';
    /* 后层：上层翼与吊舱支架。错开 2px + 压暗一档，前翼压上来后有纵深 */
    const flap = Math.round(Math.sin(t*2.1)*1.6);
    poly(INK,-9,-50-flap, -31,-66-flap, -49,-63-flap, -55,-53-flap, -44,-42-flap, -22,-38-flap, 18,-39-flap, 42,-48-flap);
    poly('#222a44',-7,-50-flap, -31,-64-flap, -48,-61-flap, -53,-53-flap, -43,-44-flap, -22,-40-flap, 18,-41-flap, 40,-49-flap);
    poly('#333f66',-30,-62-flap, -11,-52-flap, -31,-56-flap);
    poly('#333f66',20,-42-flap, 40,-50-flap, 24,-49-flap);
    bar('#8ea0c8',1, -48,-61-flap, -7,-50-flap);
    bar('#8ea0c8',1, 20,-41-flap, 40,-49-flap);
    /* 顶部天线，给剪影一点机械毛刺 */
    bar('#3b4460',1, -8,-68, -12,-80);
    rect(light,-13,-82,3,2);
    bar('#3b4460',1, 14,-68, 20,-79);
    rect(light,19,-81,3,2);
    // Long swept wings and four nacelles enclose a downward launch bay.
    poly(INK,-5,-48, -29,-62, -48,-58, -53,-46, -38,-34, -18,-31, 19,-32, 41,-41, 51,-55, 46,-66, 31,-67, 8,-56);
    poly(panel,-49,-48,-34,-60,-5,-48,-17,-39,-38,-36);
    poly('#3c4971',14,-55,33,-65,45,-65,49,-56,36,-44,14,-43);
    poly('#8689ae',-49,-48,-33,-59,-10,-50,-37,-54);
    poly('#747eb6',20,-52,33,-64,45,-64,46,-61,35,-59);
    for(let i = 0; i < 4; i++){
      const x = [-46,-31,28,40][i], y = [-51,-44,-45,-58][i];
      plate(x,y,10,12,4,paints.carrier);
      rect(dark,x+1,y+5,8,6);
      rect(light,x+2,y+7,6,2);
      const plume = 5+(Math.floor(t*18+i*1.8)%3)*2 + (p ? 2 : 0);
      poly(p ? '#ba67a7' : '#447fba',x+1,y+12,x+8,y+12,x+5,y+12+plume);
      rect(light,x+4,y+12,2,Math.round(plume*.55));
    }
    poly(INK,-24,-58,-7,-70,14,-70,26,-59,26,-40,16,-25,-18,-27,-28,-40);
    shell(paints.hivehull, -70, -51,
      -23,-58,-6,-68,13,-68,22,-58,4,-51);
    poly('#4d5884',-24,-58,4,-51,4,-27,-17,-28,-26,-41);
    poly('#313855',4,-51,23,-58,24,-41,16,-27,4,-27);
    poly('#352842',-13,-61,-4,-66,10,-66,15,-62,4,-55);
    bar('#b3bfdf',1, -23,-57, -6,-67);
    bar('#b3bfdf',1, -6,-67, 12,-67);
    bar('#b3bfdf',1, 12,-67, 22,-57);
    if(QUAL > 0) alphaRect('#dbe4ff', -6, -67, 17, 1, .25);
    rect(beam ? light : '#af8cb3',-11,-52,16,2);
    poly('#202233',-15-open,-43, 16+open,-43, 19,-29, 8,-23, -10,-23, -19,-30);
    rect('#151827',-14-open,-41, 28+open*2, 3);
    if(QUAL > 0) alphaRect(light, -12-open, -42, 24+open*2, 2, .15);
    if(phaseFlash > 0) glow(2,-35, 15, 9, light, .15*phaseFlash);
    for(let i=0;i<3;i++){
      const x = -10+i*10;
      rect(open > 2 ? light : '#557391',x,-38,6,3);
      if(bay && fire>.1) rect(light,x+2,-26-i*3,2,4+Math.floor(t*10+i)%3);
    }
    for(const side of [-1, 1]){
      g.save();
      g.scale(side,1);
      const x = 4+open;
      poly(INK,x-2,-42, x+15,-44, x+21,-37, x+15,-25, x-1,-26);
      poly('#63749c',x,-40, x+14,-42, x+18,-37, x+4,-31, x,-28);
      poly('#384867',x+4,-31,x+18,-37,x+14,-26,x,-28);
      rect(light,x+5,-34,8,2);
      if(p) poly(p>1 ? '#d583b5' : '#8796b4',x+8,-24,x+12,-24,x+15,-16,x+10,-18);
      g.restore();
    }
    if(p){
      // 阶段变化：翼根裂开、吊舱冒汽，不做整屏闪白
      crack('#1a2136', -39,-51, -34,-45, -37,-38);
      crack('#1a2136', 31,-57, 37,-50, 34,-43);
      if(p > 1){ steam(-49,-57,t,5); steam(45,-58,t,6); }
    }
  }

  function prism(s){
    const { t, p, wind, fire, light, hit, phaseFlash } = s;
    const lattice = s.action === 'prismLattice';
    const spread = Math.round(wind*7 + fire*5 + p*3);
    const wave = Math.round(Math.sin(t*2.8)*3);
    const spin = (t*(p ? 1.4 : 1.05)) % TAU;
    const nodes = [];
    for(let i = 0; i < (p ? 4 : 3); i++){
      const a = spin + i * TAU/(p ? 4 : 3);
      nodes.push({ x:Math.round(Math.cos(a)*(31+spread)), y:Math.round(Math.sin(a)*16)-44+wave, near:Math.sin(a)>0 });
    }
    function shard(node){
      const { x,y,near } = node;
      const peak = y-(lattice ? 15 : 11)-Math.round(wind*4);
      const edge = near ? '#c9efe1' : '#86a99e';
      poly(INK,x-2,peak-2,x+10,y-3,x+10,y+4,x-2,y+14,x-10,y+2,x-9,y-4);
      poly(edge,x-2,peak, x+8,y-3, x-2,y+2, x-8,y-4);
      poly('#325063',x+8,y-3,x+8,y+4,x-2,y+12,x-2,y+2);
      poly('#6c949b',x-8,y-4,x-2,y+2,x-2,y+12,x-8,y+2);
      if(near || wind > .3) bar(light,2,x-3,peak+4,x+3,y-3);
    }
    for(const n of nodes) if(!n.near) shard(n);
    g.translate(0,wave);
    /* 后层：背光菱形支架 + 一圈细光环，先压暗再让主体覆盖 */
    const bp = 3 + Math.round(wind*2);
    poly('#1a3b40', -2,-74, -18-bp,-52, -13-bp,-30, 0,-24, 13+bp,-30, 18+bp,-52);
    poly('#2b5c60', 0,-70, -13-bp,-51, -8,-35, 0,-31, 8,-35, 13+bp,-51);
    bar(paints.mirror[3],1, -15-bp,-53, 0,-71);
    bar(paints.mirror[3],1, 0,-71, 15+bp,-53);
    if(QUAL > 0){
      g.globalAlpha = .20;
      g.strokeStyle = light;
      g.lineWidth = 1;
      g.beginPath(); g.ellipse(0,-50,23+bp,17+bp,0,0,TAU); g.stroke();
      g.globalAlpha = 1;
    }
    plate(-19,-50,28,16,5,paints.mirror);
    poly(INK,0,-81, 17,-65, 20,-47, 9,-29, 2,-19, -11,-29, -20,-46, -15,-65);
    poly('#acc9c9',0,-79,15,-65,0,-53,-13,-65);
    poly('#84aab3',-13,-65,0,-53,-4,-33,-18,-47);
    poly('#416875',0,-53,15,-65,18,-47,8,-31,-4,-33);
    poly('#244759',-18,-47,-4,-33,8,-31,2,-21,-10,-30);
    bar('#dcf7ec',1, 0,-79, 14,-65);
    bar('#dcf7ec',1, 14,-65, 0,-54);
    bar('#5f8f94',1, -17,-47, -8,-32);
    if(QUAL > 0) alphaRect('#f2fffa', -4,-75, 5, 11, .16);
    if(p){
      crack('#18323d', 5,-68, 2,-57, 7,-48);
      if(p > 1) alphaRect(light, -2,-60, 4, 12, .26);
    }
    const pupil = 6+Math.round(wind*4 + hit*2);
    /* 瞳孔做成多层凹槽：外暗环 → 中环 → 发光核心，最后点玻璃高光 */
    poly('#17303d',0,-67,pupil+6,-49,0,-31,-pupil-6,-49);
    poly('#2b4c58',0,-65,pupil+4,-49,0,-33,-pupil-4,-49);
    poly('#243d54',0,-61,pupil+2,-49,0,-37,-pupil-2,-49);
    poly(light,0,-58,pupil,-49,0,-40,-pupil,-49);
    poly('#fcf9dc',0,-56,3,-49,0,-43,-3,-49);
    if(QUAL > 0){
      alphaRect('#eafff8', Math.round(-pupil*.4), -53, 2, 3, .55);
      g.globalAlpha = .28;
      g.strokeStyle = '#f2fff9';
      g.lineWidth = 1;
      g.beginPath(); g.arc(0,-49, 13, Math.PI*1.08, Math.PI*1.55); g.stroke();
      g.globalAlpha = 1;
    }
    if(phaseFlash > 0) glow(0,-50, 13, 16, light, .16*phaseFlash);
    if(p){
      bar('#465e68',2,-11,-57,-5,-48);
      bar('#2c4050',2,12,-54,5,-38);
      rect('#e9bd8b',8,-42,3,3);
      if(p > 1) steam(-14,-66,t,4);
    }
    g.translate(0,-wave);
    for(const n of nodes) if(n.near) shard(n);
  }

  function frost(s){
    const { t, p, wind, fire, light, hit, phaseFlash } = s;
    const rush = s.action === 'charge' && fire > 0;
    const lunge = Math.round(fire*(rush ? 6 : 2) - hit*3);
    const crouch = Math.round(wind*6 + Math.sin(t*7)*1.3);
    function leg(x, y, back, step){
      const gait = Math.sin(t*(rush ? 24 : 10)+step) * (rush ? 7 : wind>0 ? 1 : 4);
      const knee = x + gait*.8 - (x>0 ? 3 : 10);
      const foot = x + gait + (x>0 ? 6 : -1);
      const ankle = y - Math.max(0,gait)*.6;
      piston(x,-27+crouch,knee,ankle-8, 9, back ? paints.slate : paints.ice);
      piston(knee,ankle-8,foot,ankle-2, 5, paints.slate);
      plate(foot-5,ankle-3,9,4,3,back ? paints.slate : paints.ice);
      if(!back) rect('#d9f3f5',foot+2,ankle-1,4,2);
    }
    leg(-19,-8,true,0);
    leg(17,-8,true,Math.PI);
    /* 后层：脊背冰刺，先画、更暗，从背脊上方探出作为背光剪影 */
    for(let i = 0; i < 4; i++){
      crystal(-28 + i*9, -37+crouch, 9+(i%2)*3+p*2, 7, -2, i===1 ? light : '#6f9bb6');
    }
    poly(INK,-29,-35+crouch,-47,-35,-53,-29,-43,-25,-28,-24);
    poly('#789fb1',-30,-34+crouch,-46,-33,-51,-29,-43,-27,-28,-25);
    poly(INK,-36,-30+crouch,-24,-48+crouch,2,-49+crouch,25,-43+crouch,31,-23+crouch,16,-14+crouch,-21,-14+crouch,-36,-22+crouch);
    shell(paints.frosthull, -48+crouch, -14+crouch,
      -33,-30+crouch,-23,-46+crouch,2,-47+crouch,24,-41+crouch,9,-31+crouch,-21,-27+crouch);
    poly('#6085a6',-34,-30+crouch,-21,-27+crouch,9,-31+crouch,16,-16+crouch,-20,-16+crouch,-34,-23+crouch);
    poly('#395577',9,-31+crouch,24,-41+crouch,29,-24+crouch,16,-16+crouch);
    bar('#dcf4f7',1, -23,-46+crouch, 2,-47+crouch);
    bar('#dcf4f7',1, 2,-47+crouch, 23,-42+crouch);
    if(QUAL > 0) alphaRect('#f4feff', -8,-46+crouch, 14, 1, .20);
    if(phaseFlash > 0) glow(-6,-38+crouch, 16, 9, light, .15*phaseFlash);
    if(p){
      crack('#203d5c', -18,-28+crouch, -11,-20+crouch, -4,-22+crouch, 2,-15+crouch);
      if(p > 1) steam(-28,-38+crouch, t, 2);
    }
    for(let i=0;i<4;i++){
      const x = -27+i*11;
      crystal(x,-39+crouch+(i===0?3:0),13+(i%3)*4+p*3+wind*5,10,-2+(i%2)*2,i===2 ? light : '#b8dce7');
    }
    plate(-23,-28+crouch,16,8,5,paints.slate);
    leg(-24,0,false,Math.PI);
    leg(19,0,false,0);
    const x = 23 + lunge, y = -44 + crouch;
    const jaw = Math.round(wind*6 + fire*8 + p*2);
    crystal(x-3,y+5,17+p*3,10,-6,'#b4e0e8');
    poly(INK,x-5,y+2,x+9,y-4,x+20,y+4,x+22,y+20,x+14,y+24+jaw,x+4,y+21+jaw,x-7,y+17);
    poly('#38567a',x-6,y+16,x+8,y+15+jaw,x+20,y+19+jaw,x+14,y+23+jaw,x+4,y+20+jaw);
    poly('#9fcad2',x-4,y+3,x+9,y-3,x+18,y+5,x+12,y+10,x-5,y+11);
    poly('#618da7',x-5,y+11,x+12,y+10,x+19,y+7,x+20,y+15,x+15,y+19,x+4,y+17,x-5,y+16);
    bar('#e6fbfd',1, x-3,y+3, x+8,y-2);
    bar('#e6fbfd',1, x+8,y-2, x+17,y+5);
    if(QUAL > 0) alphaRect('#f4feff', x-1,y+4, 9, 1, .25);
    rect(light,x+10,y+7,7,2);
    poly('#dff9ff',x+12,y+16,x+17,y+16,x+14,y+23+Math.round(jaw*.6));
    if(wind > .35 && QUAL > 0) alphaRect('#d9f3f5', x+12, y+15, 4, 2, .30);
    if(p) bar(light,2,-10,-25+crouch,-3,-18+crouch);
  }

  function molten(s){
    const { t, p, wind, fire, light, hit, phaseFlash } = s;
    const flame = s.action === 'flame';
    const stroke = Math.round(wind*7 - fire*3 + Math.sin(t*7)*2 + Math.sin(t*4.1)*1.2*(1-wind));
    const mouth = Math.round(3 + wind*9 + fire*(flame ? 11 : 7) + p*2);
    const sway = Math.round(Math.sin(t*3.4)*1.2);
    const hot = p ? (p > 1 ? '#ffb060' : '#ff9d42') : '#c96a3c';

    /* 1. 后层：背部烟囱组 + 热羽流。压暗、向左错 1–2px，作为背光剪影 */
    const puff = Math.round(Math.sin(t*2.2)*1.4);
    poly(INK, -38,-57+stroke, -27,-63+stroke, -12,-58+stroke, -14,-33+stroke, -35,-31+stroke);
    poly('#2f2834', -36,-55+stroke, -27,-60+stroke, -15,-56+stroke, -17,-35+stroke, -33,-34+stroke);
    poly('#4a3130', -33,-54+stroke, -27,-58+stroke, -20,-54+stroke, -28,-50+stroke);
    piston(-31,-55+stroke, -35-sway,-74+stroke, 5, paints.iron);
    piston(-22,-56+stroke, -25-sway,-70+stroke, 4, paints.iron);
    rect(p ? light : '#8a5140', -37-sway,-77+stroke, 5, 3);
    rect(p > 1 ? light : '#6b4238', -27-sway,-73+stroke, 4, 3);
    if(QUAL > 0){
      // 热羽流：低透明度舌头，只在主体后面，不抢弹幕
      const rise = 10 + Math.round(Math.sin(t*5)*3) + (p ? 4 : 0) + Math.round(wind*5);
      g.globalAlpha = .19 + (p ? .07 : 0);
      poly('#ff6a38', -29,-64+stroke, -24,-64-rise+stroke, -19,-62+stroke, -15,-70-Math.round(rise*.5)+stroke, -12,-58+stroke);
      g.globalAlpha = .15;
      poly(light, -27,-64+stroke, -23,-60-Math.round(rise*.55)+stroke, -18,-63+stroke, -17,-66+stroke);
      g.globalAlpha = 1;
    }
    if(p) steam(-36-sway, -78+stroke, t, 1);

    /* 2. 支撑腿：大腿/小腿/脚掌分件，脚底压暗贴地 */
    function strut(x, y, phase){
      const foot = Math.round(Math.sin(t*5+phase)*3*(1-wind));
      piston(x,-26+stroke, x+foot, y-10, 12, paints.iron);
      piston(x+foot, y-10, x+foot+3, y-4, 7, paints.furnace);
      plate(x+foot-10, y-6, 20, 7, 5, paints.furnace);
      rect('#c59172', x+foot-7, y-4, 11, 2);
      rect(paints.furnace[4], x+foot-9, y+1, 18, 2);
      if(QUAL > 0) rect(paints.iron[3], x+foot-8, y-5, 7, 1);
    }
    strut(15,-6,0);
    strut(-20,1,Math.PI);

    /* 3. 后腰配重块与输油管：先于主体，形成内构暗部 */
    plate(-34,-42+stroke, 22, 22, 7, paints.iron);
    hose(-31,-38+stroke, -25,-30+stroke, -17,-32+stroke, '#8e5a45');

    /* 4. 主体：暗轮廓 + 竖向渐变装甲；下腹再压一层背光 */
    plate(-32,-40+stroke, 45, 24, 9, paints.iron);
    poly(INK, -20,-52+stroke, 11,-57+stroke, 36,-45+stroke, 41,-28+stroke, 31,-13+stroke, -16,-10+stroke, -26,-28+stroke);
    shell(paints.furnace, -57+stroke, -11+stroke,
      -19,-51+stroke, 11,-55+stroke, 34,-44+stroke, 40,-29+stroke, 30,-15+stroke, -15,-12+stroke, -25,-27+stroke);
    poly('#582f37', -24,-28+stroke, 22,-37+stroke, 39,-29+stroke, 31,-15+stroke, -15,-12+stroke);
    bar('#eeb488',1, -19,-51+stroke, 11,-55+stroke);
    bar('#eeb488',1, 11,-55+stroke, 34,-44+stroke);
    if(QUAL > 0) alphaRect('#ffd7a8', -10,-53+stroke, 25, 1, .16);
    plate(-28,-52+stroke, 18, 13, 5, paints.furnace);
    rivet(-25,-49+stroke, '#e0a179');
    /* 背部热交换鳍：低矮地排在肩后，不挡胸口炉心 */
    for(let i = 0; i < 3; i++){
      const fx = -26+i*10, fh = 16-(i%2)*5, fy = -47-fh+stroke;
      plate(fx, fy, 6, fh, 3, paints.furnace);
      rect('#e7ac78', fx, fy+2, 6, 2);
      if(p || wind>.25) ember(fx+2, fy-4, t, i*3, i===1 ? '#e8916a' : light);
    }

    /* 5. 胸口格栅与炉心：阶段越高，内构越亮 */
    poly(INK, -15,-38+stroke, 10,-40+stroke, 17,-30+stroke, 10,-20+stroke, -12,-21+stroke, -18,-30+stroke);
    poly('#2a202c', -13,-36+stroke, 8,-38+stroke, 14,-30+stroke, 8,-22+stroke, -10,-23+stroke, -15,-30+stroke);
    rect(hot, -9,-33+stroke, 16, 2);
    rect(light, -8,-31+stroke, 14, 2);
    if(p){
      alphaRect(light, -6,-30+stroke, 10, 4, .28);
      crack('#211a24', -15,-39+stroke, -9,-45+stroke, -3,-43+stroke);
    } else if(QUAL > 0) alphaRect(light, -6,-28+stroke, 10, 1, .22);
    if(phaseFlash > 0){
      glow(0,-29+stroke, 13, 10, light, .20*phaseFlash);
      if(phaseFlash > .5) steam(-36-sway, -78+stroke, t, 7);
    }

    /* 6. 右臂液压与炮身：先搭结构，再画炉喉 */
    piston(-2,-40+stroke, 12,-31+stroke, 8, paints.steel);
    plate(4,-41+stroke, 14, 10, 5, paints.iron);
    hose(-17,-31+stroke, -9,-39+stroke, 1,-35+stroke, '#b06a48');

    const x = -9 + Math.round(fire*3-hit*2), y = -39 + stroke;
    poly('#342534', x+1,y-3, x+26,y-5, x+35,y+4, x+32,y+22, x+7,y+24, x-1,y+18);
    bar('#7c5a4a',1, x+1,y-2, x+25,y-4);
    bar('#5a3d3e',1, x+2,y+21, x+30,y+19);
    poly('#4a1f1e', x, y+13-mouth, x+27, y+11-mouth, x+33, y+16, x+31, y+20, x+6, y+23);
    poly('#962d27', x+2,y+14-mouth, x+26,y+12-mouth, x+31,y+16, x+29,y+19, x+7,y+21);
    rect('#bd4b2b', x+6,y+17-mouth, 21, mouth);
    if(QUAL > 0) alphaRect(light, x+8, y+18-mouth, 18, 2, .24);
    for(let i=0;i<5;i++){
      const height = Math.min(mouth, 4+(Math.floor(t*25+i*4)%9));
      rect(i%2 ? '#ffad54' : light, x+7+i*4, y+19-height, 3, height);
    }
    plate(x+1, y-mouth+7, 26, 7, 4, paints.furnace);
    rivet(x+3, y-mouth+9, '#c59078');
    rivet(x+23, y-mouth+9, '#c59078');
    // 炉口上唇：给炮口一个明确的机械边界，蓄力时提亮
    rect('#3b2328', x+1, y-mouth+5, 30, 2);
    rect(wind > .2 ? light : hot, x+22, y+12, 6, 2);
    if(p){
      bar('#362434',4, -19,-39+stroke, -9,-24+stroke);
      bar(light,2, -17,-34+stroke, -10,-25+stroke);
      // 破甲：肩甲翻开、管线外露、炉口漏光
      poly('#6a3a30', -25,-50+stroke, -20,-54+stroke, -15,-50+stroke, -20,-45+stroke);
      rect(light, -17,-43+stroke, 3, 6);
    }
    if(p>1){
      poly('#ff8450', -24,-29+stroke, -20,-27+stroke, -23,-21+stroke, -25,-23+stroke);
      rect(light, -38,-19+stroke, 5, 3);
      crack('#241a22', 12,-43+stroke, 18,-36+stroke, 15,-26+stroke);
      ember(-30,-48+stroke, t, 2, light);
    }
  }

  function voidEye(s){
    const { t,p,wind,fire,light,hit,phaseFlash } = s;
    const beam = s.action === 'teleBeam';
    const drift = Math.round(Math.sin(t*2.3)*4);
    g.translate(0,drift);
    const expansion = Math.round(wind*4 + fire*4 + p*2);
    const tilt = .38+Math.sin(t*1.6)*.15;

    /* 背层 1：连接外壳与浮环的暗触须（仅高画质补结构，低画质省略） */
    if(QUAL > 0){
      for(let i = 0; i < 3; i++){
        const a = -.6+i*2.1 + Math.sin(t*.8+i)*.09;
        const ex = Math.cos(a)*(46+p*3), ey = -46+Math.sin(a)*25;
        hose(0,-46, ex*.52,-46+(ey+46)*.55, ex, ey, '#3a2a50');
      }
    }

    /* 背层 2：漂浮碎晶。远侧先画，近侧最后压在前景 */
    const spin = t*.35;
    function shardBack(x, y, near){
      const k = near ? 1 : .82;
      poly(INK, x-6*k,y, x,y-9*k, x+7*k,y-2, x+3*k,y+8);
      poly(near ? '#4e376b' : '#332549', x-5*k,y, x,y-8*k, x+6*k,y-2, x+2*k,y+7);
      if(near){
        bar('#b98ddf',1, x-2,y-1, x,y-7);
        if(QUAL > 0) alphaRect(light, x-1,y-2, 2, 3, .38);
      }
    }
    for(let i = 0; i < 6; i++){
      const a = spin+i*TAU/6;
      if(Math.sin(a) < -.12) shardBack(Math.cos(a)*(46+p*2), -46+Math.sin(a)*27, false);
    }

    function ring(rx,ry, angle, phase, near, outer){
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const width = 5 + (outer ? 1 : 0);
      for(let i=0;i<16;i++){
        if((i+phase)%5 === 0 || (p>1 && (i+phase+1)%7===0)) continue;
        const a1 = (i+phase*.34)/16*TAU, a2 = a1 + TAU/17.5;
        if((Math.sin((a1+a2)/2)>0)!==near) continue;
        const x1 = Math.cos(a1)*rx, y1 = Math.sin(a1)*ry;
        const x2 = Math.cos(a2)*rx, y2 = Math.sin(a2)*ry;
        const ax=x1*ca-y1*sa, ay=x1*sa+y1*ca-46;
        const bx=x2*ca-y2*sa, by=x2*sa+y2*ca-46;
        // 环带厚度：先向下压一道暗影，再叠主带与轮缘
        if(QUAL > 0) bar('#170f24', width+4, ax, ay+2, bx, by+2);
        bar(INK,width+3,ax,ay,bx,by);
        bar(near ? '#825798' : '#543665',width,ax,ay,bx,by);
        bar(near && (i%3 === 0 || wind>.45) ? light : '#a77cbe',1,ax,ay-2,bx,by-2);
      }
    }
    const phase = Math.floor(t*(p ? 6 : 4))%16;
    ring(39+expansion,19,tilt,phase,false,true);
    ring(32,27+expansion*.3,-tilt,15-phase,false,false);

    const eyeX = Math.round(wind*(beam ? 4 : 2) + fire*3 - hit*3);
    const aperture = Math.round(wind*6 + fire*(beam ? 11 : 7));
    /* 外壳：暗轮廓 + 竖向渐变，再叠下壳暗面与上缘轮缘光 */
    poly(INK,-29,-46,-21,-61,-7,-67,9,-65,22,-59,30,-46,21,-33,4,-25,-13,-28,-24,-35);
    shell(paints.voidarmor, -66, -25,
      -28,-46,-19,-60,-7,-65,9,-63,22,-57,27,-47,20,-34,4,-27,-12,-30,-23,-36);
    poly('#3b2852',-27,-44,16,-48,25,-45,20,-35,4,-28,-12,-31,-23,-37);
    poly('#2a1d3d',-23,-46,-11,-55,5,-59,18,-56,26,-48,18,-40,5,-36,-12,-38);
    bar('#c9a6dd',1, -19,-60, -7,-64);
    bar('#c9a6dd',1, -7,-64, 9,-62);
    bar('#c9a6dd',1, 9,-62, 21,-56);
    if(QUAL > 0) alphaRect('#e5ccf7', -6,-63, 14, 2, .16);
    if(QUAL > 0 && (wind > .3 || p)){
      // 眼窝内的柔和辉光，随蓄力/阶段增强，但不扩散到全屏
      g.globalAlpha = .15 + (p ? .07 : 0) + wind*.05;
      g.fillStyle = light;
      g.beginPath(); g.ellipse(eyeX,-47, 15+aperture*.3, 11+aperture*.2, 0, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    if(phaseFlash > 0) glow(eyeX,-47, 16, 12, light, .18*phaseFlash);
    /* 虹膜：外暗环 → 中环 → 发光核心 → 竖瞳，最后一道玻璃高光 */
    poly('#4b2d66', eyeX-20,-46, eyeX-8,-52-aperture*.3, eyeX+6,-55-aperture*.25, eyeX+17,-53, eyeX+23,-47, eyeX+14,-41, eyeX+3,-38-aperture*.2, eyeX-10,-40);
    poly('#aa71c4', eyeX-18,-46, eyeX-7,-51-aperture*.3, eyeX+6,-53-aperture*.25, eyeX+16,-52, eyeX+21,-47, eyeX+13,-42, eyeX+3,-39-aperture*.18, eyeX-9,-41);
    poly(light, eyeX-7-aperture*.3,-50, eyeX+1,-56, eyeX+8+aperture*.4,-50, eyeX+4,-40, eyeX-5,-42);
    poly(aperture > 8 ? '#fffaff' : '#412743', eyeX,-54, eyeX+3,-49, eyeX,-41, eyeX-2,-48);
    rect('#fff3ff', eyeX-4,-51, 2, 2);
    if(QUAL > 0){
      g.globalAlpha = .26;
      g.strokeStyle = '#f0dbff';
      g.lineWidth = 1;
      g.beginPath(); g.arc(eyeX,-47, 17, Math.PI*1.06, Math.PI*1.52); g.stroke();
      g.globalAlpha = 1;
    }
    if(p){
      // 阶段变化：壳面裂纹 + 眼窝漏光，不靠闪白表达
      crack('#1c1228', -14,-57, -8,-50, -12,-42);
      crack('#1c1228', 12,-58, 18,-51, 15,-44);
      if(p > 1) alphaRect(light, -2,-62, 4, 5, .26);
    }

    ring(32,27+expansion*.3,-tilt,15-phase,true,false);
    ring(39+expansion,19,tilt,phase,true,true);
    for(let i = 0; i < 6; i++){
      const a = spin+i*TAU/6;
      if(Math.sin(a) >= .12) shardBack(Math.cos(a)*(46+p*2), -46+Math.sin(a)*27, true);
    }
    if(p){
      for(let i=0;i<3;i++){
        const a=t*2.5+i*TAU/3, x=Math.cos(a)*(44+p*3), y=-46+Math.sin(a)*25;
        poly('#382a4e',x-4,y,x,y-7,x+5,y-2,x+1,y+7);
        poly(light,x-2,y,x,y-6,x+3,y-2,x,y+3);
      }
    }
  }

  const models = { bulwark, crusher, hive, prism, frost, molten, void:voidEye };
  const floating = new Set(['hive','prism','void']);
  let previous, stamp;

  /* 轮廓遮罩：由已完成帧反推出剪影，只用于外缘背光。尺寸与 tile 一致 */
  const sil = document.createElement('canvas');
  sil.width = tile.width;
  sil.height = tile.height;
  const sg = sil.getContext('2d');
  /* 整体受光/背光：只作用于实体像素（source-atop），一次填充，不产生新对象 */
  let sheetGrad;
  function sheet(){
    if(!sheetGrad){
      sheetGrad = g.createLinearGradient(0, 0, 0, tile.height);
      sheetGrad.addColorStop(0, 'rgba(255,244,220,.09)');
      sheetGrad.addColorStop(.42, 'rgba(255,255,255,0)');
      sheetGrad.addColorStop(1, 'rgba(9,11,21,.15)');
    }
    return sheetGrad;
  }
  /* 背光光晕：每个 Boss 预生成一张，运行时只做 drawImage */
  const halos = Object.create(null);
  function halo(kind){
    let c = halos[kind];
    if(c) return c;
    const w = 128, h = 96;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const col = lamps[kind] || lamps.bulwark;
    const rg = x.createRadialGradient(w/2, h/2, 2, w/2, h/2, w/2);
    rg.addColorStop(0, col[1]);
    rg.addColorStop(.40, col[0]);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = .5;
    x.fillStyle = rg;
    x.fillRect(0, 0, w, h);
    halos[kind] = c;
    return c;
  }

  function draw(target, b, sx, sy, quality, time, shadow){
    QUAL = quality;
    const model = models[b.kind];
    const dead = b.dead ? Math.min(1,b.deadT/.8) : 0;
    if(dead>=1) return;
    const a = b.dead ? null : b.act;
    const wind = a && !a.fired && a.wind ? Math.min(1,(a.t || 0)/a.wind) : 0;
    const blast = b.kind==='crusher' && b.ph===2 && !b.dead && b.t-b.ventAt<.24;
    const fire = a?.fired ? 1 - Math.min(.8, (a.t-a.wind)/Math.max(.12,a.dur)) : blast ? .85 : 0;
    const hit = b.dead ? 0 : Math.min(1,Math.max(0,b.flash)/.09);
    const pf = b.dead ? 0 : Math.min(1, Math.max(0, b.phFlash || 0) / 1.2);
    const tick = Math.floor(b.t*(quality ? 30 : 20));
    const key = [tick,b.ph,a?.visual,a?.fired,quality,Math.round(hit*6),Math.round(pf*4),b.dead,blast].join('/');
    if(b!==previous || key!==stamp){
      previous=b;
      stamp=key;
      const p = b.ph, palette = lamps[b.kind];
      const light = hit>.17 || wind>.56 || fire>.48 ? palette[2] : palette[p ? 1 : 0];
      g.setTransform(1,0,0,1,0,0);
      g.clearRect(0,0,tile.width,tile.height);
      g.translate(58,94);
      g.save();
      model({t:tick/(quality ? 30 : 20),p,wind,fire,hit,light,quality,phaseFlash:pf,action:a?.visual});
      g.restore();
      if(quality > 0){
        // 统一朝向的顶部受光/底部压暗，让每一层部件共享同一套环境光
        g.save();
        g.setTransform(1,0,0,1,0,0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = sheet();
        g.fillRect(0,0,tile.width,tile.height);
        g.restore();
      }
      if(hit>.23){
        // Light only the opaque pixels on impact, retaining the silhouette.
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = hit*.18;
        rect('#ffe6ca',-58,-94,116,112);
        g.globalAlpha=1;
        g.globalCompositeOperation='source-over';
      }
      if(quality > 0){
        // 反推剪影，供外缘背光使用（低频：只在帧缓存刷新时生成）
        sg.setTransform(1,0,0,1,0,0);
        sg.clearRect(0,0,sil.width,sil.height);
        sg.drawImage(tile,0,0);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = light;
        sg.fillRect(0,0,sil.width,sil.height);
        sg.globalCompositeOperation = 'source-over';
      }
    }
    const hover = floating.has(b.kind);
    const rise = Math.round(Math.max(0,.3-b.t)*26)*(hover ? 2 : 1);
    const shift = b.kind==='void' && !b.dead && time-b.teleportedAt < .22;
    const scale = .92 + (b.r-30)*.013;
    const breathe = Math.sin(b.t*2.6);
    /* 背光：先在地面/背景上铺一层很淡的暖/冷光，再压接触阴影，保持接地感 */
    if(quality > 0 && dead < 1){
      const hw = b.r*3.2, hh = b.r*2.1;
      target.save();
      target.globalCompositeOperation = 'lighter';
      target.globalAlpha = (1-dead)*(.10 + (b.ph ? .03 : 0) + wind*.05 + hit*.07 + pf*.09);
      target.drawImage(halo(b.kind), sx-hw/2, sy-b.h*.64-hh/2, hw, hh);
      target.restore();
    }
    shadow(sx, sy+1, b.r*(hover ? 1.42 + breathe*.025 : 1.55),
      (hover ? .5 : .73)*(1-dead), (hover ? .30 : .36) + (hover ? breathe*.012 : 0));
    target.save();
    target.imageSmoothingEnabled = false;
    target.translate(sx,sy+Math.round(dead*9)-rise);
    if(b.dead) target.rotate(b.face*dead*.21);
    target.scale(b.face*scale,scale);
    target.globalAlpha = (1-dead)*Math.min(1,.55+b.t*3);
    if(shift){
      target.globalAlpha *= .44;
      target.drawImage(tile,-63,-94);
      target.globalAlpha /= .44;
    }
    /* 外缘背光：剪影左上错 2px 叠色，只在轮廓外侧可见，不糊住细节 */
    if(quality > 0){
      target.save();
      target.globalCompositeOperation = 'lighter';
      target.globalAlpha *= .26 + (b.ph ? .07 : 0) + wind*.10 + pf*.12;
      target.drawImage(sil, -60, -96);
      target.restore();
    }
    target.drawImage(tile,-58,-94);
    target.restore();
  }
  return { draw };
})();
