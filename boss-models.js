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
    iron: ['#484756', '#82808b', '#2f2a3a']
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
    rect(p[0], x,y,w,h);
    rect(p[2], x,y+h-2,w,2);
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
    const { t, p, wind, fire, light, hit } = s;
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
    plate(-26,-48+body,36,29,7,paints.steel);
    plate(-20,-59+body,19,15,5,paints.brass);
    rect('#292739',-16,-54+body,15,6);
    rect(light,-12,-53+body,10,2);
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
    const { t, p, wind, fire, light, hit } = s;
    const rev = s.action === 'charge' && fire > 0;
    const skew = Math.round(wind*3-fire*2);
    const lift = Math.round(wind*7-fire*2);
    function track(x, y, span, back){
      poly(INK,x-5,y+5, x+4,y-2, x+span-5,y-2, x+span+3,y+5, x+span+3,y+16, x+span-6,y+20, x+1,y+20, x-5,y+14);
      poly(back ? '#46414b' : '#605052',x-2,y+5, x+5,y, x+span-6,y, x+span+1,y+5, x+span,y+14, x+span-6,y+18, x+1,y+18);
      rect('#302630',x+3,y+6,span-6,9);
      const phase = Math.floor(t*(rev ? 45 : 22)) % 7;
      for(let i = 5; i < span - 7; i += 7){
        rect(back ? '#6b5650' : '#9c7f6a',x+i+phase,y+16,3,2);
        rect('#564b50',x+i,y+8,4,5);
      }
    }
    track(-30,-26,56,true);
    plate(-36,-33+skew,58,20,8,paints.sand);
    track(-42,-19,64,false);
    plate(-43,-38+skew,18,12,5,paints.rubber);
    slots(-40,-35+skew,3,'#8d7b6d');
    plate(-24,-45+skew,34,14,6,paints.sand);
    if(p){
      // The armored radiator has peeled off its mount, exposing two hot fins.
      piston(-29,-38+skew,-37,-44+skew,6,paints.steel);
      plate(-46,-49+skew,13,8,4,paints.sand);
      rect('#40313a',-32,-44+skew,10,10);
      slots(-31,-43+skew,2,light);
    }
    plate(-21,-53+skew,22,9,4,paints.rubber);
    rect('#261e2a',-17,-51+skew,15,5);
    rect(light,-16,-50+skew,13,2);
    piston(-10,-38+skew, 22,-31-lift, 7, paints.steel);
    piston(-9,-20, 26,-18-lift, 8, paints.steel);
    const x = 17 + Math.round(fire*4-hit*2), y = -34-lift;
    poly(INK,x-1,y+3, x+21,y-7, x+31,y-6, x+35,y+19, x+29,y+34, x+3,y+40, x-3,y+31);
    poly('#c1814c',x,y+4, x+22,y-5, x+29,y-4, x+24,y+5, x+9,y+11);
    poly('#a4673c',x+9,y+11, x+24,y+5, x+30,y-4, x+33,y+19, x+27,y+32, x+4,y+38, x+7,y+29);
    poly('#59404d',x+1,y+5, x+9,y+11, x+7,y+29, x+4,y+38, x-1,y+30);
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
    const { t, p, wind, fire, light } = s;
    const bay = s.action === 'spawnDrones';
    const beam = s.action === 'sweep' || s.action === 'sweepSpin';
    const open = Math.round(wind*(bay ? 11 : 7) + fire*(bay ? 12 : 5));
    const heave = Math.round(Math.sin(t*3)*4 + wind*3 - fire*4);
    g.translate(0, heave);
    const dark = '#242337', panel = '#4d5286';
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
    poly('#7b86ad',-24,-58,-6,-68,13,-68,23,-58,4,-51);
    poly('#4d5884',-24,-58,4,-51,4,-27,-17,-28,-26,-41);
    poly('#313855',4,-51,23,-58,24,-41,16,-27,4,-27);
    poly('#352842',-13,-61,-4,-66,10,-66,15,-62,4,-55);
    rect(beam ? light : '#af8cb3',-11,-52,16,2);
    poly('#202233',-15-open,-43, 16+open,-43, 19,-29, 8,-23, -10,-23, -19,-30);
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
  }

  function prism(s){
    const { t, p, wind, fire, light, hit } = s;
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
    plate(-19,-50,28,16,5,paints.mirror);
    poly(INK,0,-81, 17,-65, 20,-47, 9,-29, 2,-19, -11,-29, -20,-46, -15,-65);
    poly('#acc9c9',0,-79,15,-65,0,-53,-13,-65);
    poly('#84aab3',-13,-65,0,-53,-4,-33,-18,-47);
    poly('#416875',0,-53,15,-65,18,-47,8,-31,-4,-33);
    poly('#244759',-18,-47,-4,-33,8,-31,2,-21,-10,-30);
    const pupil = 6+Math.round(wind*4 + hit*2);
    poly('#243d54',0,-61,pupil+2,-49,0,-37,-pupil-2,-49);
    poly(light,0,-58,pupil,-49,0,-40,-pupil,-49);
    poly('#fcf9dc',0,-56,3,-49,0,-43,-3,-49);
    if(p){
      bar('#465e68',2,-11,-57,-5,-48);
      bar('#2c4050',2,12,-54,5,-38);
      rect('#e9bd8b',8,-42,3,3);
    }
    g.translate(0,-wave);
    for(const n of nodes) if(n.near) shard(n);
  }

  function frost(s){
    const { t, p, wind, fire, light, hit } = s;
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
    poly(INK,-29,-35+crouch,-47,-35,-53,-29,-43,-25,-28,-24);
    poly('#789fb1',-30,-34+crouch,-46,-33,-51,-29,-43,-27,-28,-25);
    poly(INK,-36,-30+crouch,-24,-48+crouch,2,-49+crouch,25,-43+crouch,31,-23+crouch,16,-14+crouch,-21,-14+crouch,-36,-22+crouch);
    poly('#a6c7ce',-34,-30+crouch,-23,-46+crouch,2,-47+crouch,24,-41+crouch,9,-31+crouch,-21,-27+crouch);
    poly('#6085a6',-34,-30+crouch,-21,-27+crouch,9,-31+crouch,16,-16+crouch,-20,-16+crouch,-34,-23+crouch);
    poly('#395577',9,-31+crouch,24,-41+crouch,29,-24+crouch,16,-16+crouch);
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
    rect(light,x+10,y+7,7,2);
    poly('#dff9ff',x+12,y+16,x+17,y+16,x+14,y+23+Math.round(jaw*.6));
    if(p) bar(light,2,-10,-25+crouch,-3,-18+crouch);
  }

  function molten(s){
    const { t, p, wind, fire, light, hit } = s;
    const flame = s.action === 'flame';
    const stroke = Math.round(wind*7 - fire*3 + Math.sin(t*7)*2);
    const mouth = Math.round(3 + wind*9 + fire*(flame ? 11 : 7) + p*2);
    function strut(x, y, phase){
      const foot = Math.round(Math.sin(t*5+phase)*3*(1-wind));
      piston(x,-26+stroke,x+foot,y-7,12,paints.iron);
      plate(x+foot-10,y-6,20,7,5,paints.furnace);
      rect('#c59172',x+foot-7,y-4,11,2);
    }
    strut(15,-6,0);
    strut(-20,1,Math.PI);
    plate(-32,-40+stroke,45,24,9,paints.iron);
    for(let i = 0; i < 3; i++){
      const x=-26+i*11, h=22-(i%2)*6, y=-45-h+stroke;
      plate(x,y,7,h,3,paints.furnace);
      rect('#e7ac78',x,y+2,7,2);
      if((s.quality>0 || wind>.25) && (p || wind>.25)){
        const dy=(Math.floor(t*(p ? 21 : 14)+i*7)%12);
        rect(i===1 ? '#9c694c' : light,x+2+i%2,y-dy-5,2,3);
      }
    }
    piston(-25,-45+stroke,-38,-21+stroke,9,paints.steel);
    plate(-43,-25+stroke,15,13,4,paints.furnace);
    poly(INK,-20,-52+stroke, 11,-57+stroke, 36,-45+stroke, 41,-28+stroke, 31,-13+stroke, -16,-10+stroke,-26,-28+stroke);
    poly('#a46750',-24,-28+stroke,-19,-51+stroke,11,-55+stroke,34,-44+stroke,22,-37+stroke);
    poly('#582f37',-24,-28+stroke,22,-37+stroke,39,-29+stroke,31,-15+stroke,-15,-12+stroke);
    const x = -9 + Math.round(fire*3-hit*2), y = -39 + stroke;
    poly('#342534',x+1,y-3,x+26,y-5,x+35,y+4,x+32,y+22,x+7,y+24,x-1,y+18);
    poly('#962d27',x+2,y+14-mouth,x+26,y+12-mouth,x+31,y+16,x+29,y+19,x+7,y+21);
    rect('#bd4b2b',x+6,y+17-mouth,21,mouth);
    for(let i=0;i<5;i++){
      const height = Math.min(mouth,4+(Math.floor(t*25+i*4)%9));
      rect(i%2 ? '#ffad54' : light,x+7+i*4,y+19-height,3,height);
    }
    plate(x+1,y-mouth+7,26,7,4,paints.furnace);
    rivet(x+3,y-mouth+9,'#c59078');
    rivet(x+23,y-mouth+9,'#c59078');
    if(p){
      bar('#362434',4,-19,-39+stroke,-9,-24+stroke);
      bar(light,2,-17,-34+stroke,-10,-25+stroke);
    }
    if(p>1){
      poly('#ff8450',-24,-29+stroke,-20,-27+stroke,-23,-21+stroke,-25,-23+stroke);
      rect(light,-38,-19+stroke,5,3);
    }
  }

  function voidEye(s){
    const { t,p,wind,fire,light,hit } = s;
    const beam = s.action === 'teleBeam';
    const drift = Math.round(Math.sin(t*2.3)*4);
    g.translate(0,drift);
    const expansion = Math.round(wind*4 + fire*4 + p*2);
    const tilt = .38+Math.sin(t*1.6)*.15;
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
    poly(INK,-29,-46,-21,-61,-7,-67,9,-65,22,-59,30,-46,21,-33,4,-25,-13,-28,-24,-35);
    poly('#8471a2',-28,-46,-19,-60,-7,-65,9,-63,22,-57,27,-47,9,-51,-13,-51);
    poly('#604274',-28,-46,-13,-51,9,-51,27,-47,20,-34,4,-27,-12,-30,-23,-36);
    poly('#372946',-23,-46,-11,-55,5,-59,18,-56,26,-48,18,-40,5,-36,-12,-38);
    poly('#aa71c4',-20,-46,-8,-52-aperture*.3,6,-55-aperture*.25,17,-53,23,-47,14,-41,3,-38-aperture*.2,-10,-40);
    poly(light,eyeX-7-aperture*.3,-50,eyeX+1,-56,eyeX+8+aperture*.4,-50,eyeX+4,-40,eyeX-5,-42);
    poly(aperture > 8 ? '#fffaff' : '#412743',eyeX,-54,eyeX+3,-49,eyeX,-41,eyeX-2,-48);
    rect('#fff3ff',eyeX-4,-51,2,2);
    ring(32,27+expansion*.3,-tilt,15-phase,true,false);
    ring(39+expansion,19,tilt,phase,true,true);
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

  function draw(target, b, sx, sy, quality, time, shadow){
    const model = models[b.kind];
    const dead = b.dead ? Math.min(1,b.deadT/.8) : 0;
    if(dead>=1) return;
    const a = b.dead ? null : b.act;
    const wind = a && !a.fired && a.wind ? Math.min(1,(a.t || 0)/a.wind) : 0;
    const blast = b.kind==='crusher' && b.ph===2 && !b.dead && b.t-b.ventAt<.24;
    const fire = a?.fired ? 1 - Math.min(.8, (a.t-a.wind)/Math.max(.12,a.dur)) : blast ? .85 : 0;
    const hit = b.dead ? 0 : Math.min(1,Math.max(0,b.flash)/.09);
    const tick = Math.floor(b.t*(quality ? 30 : 20));
    const key = [tick,b.ph,a?.visual,a?.fired,quality,Math.round(hit*6),b.dead,blast].join('/');
    if(b!==previous || key!==stamp){
      previous=b;
      stamp=key;
      const p = b.ph, palette = lamps[b.kind];
      const light = hit>.17 || wind>.56 || fire>.48 ? palette[2] : palette[p ? 1 : 0];
      g.setTransform(1,0,0,1,0,0);
      g.clearRect(0,0,tile.width,tile.height);
      g.translate(58,94);
      g.save();
      model({t:tick/(quality ? 30 : 20),p,wind,fire,hit,light,quality,action:a?.visual});
      g.restore();
      if(hit>.23){
        // Light only the opaque pixels on impact, retaining the silhouette.
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = hit*.18;
        rect('#ffe6ca',-58,-94,116,112);
        g.globalAlpha=1;
        g.globalCompositeOperation='source-over';
      }
    }
    const hover = floating.has(b.kind);
    const rise = Math.round(Math.max(0,.3-b.t)*26)*(hover ? 2 : 1);
    const shift = b.kind==='void' && !b.dead && time-b.teleportedAt < .22;
    const scale = .92 + (b.r-30)*.013;
    shadow(sx,sy+1,b.r*(hover ? 1.42 : 1.55),(hover ? .5 : .73)*(1-dead),hover ? .30 : .36);
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
    target.drawImage(tile,-58,-94);
    target.restore();
  }
  return { draw };
})();
