/* The mine layout uses the same arena coordinate basis as the surface lift. */
const MineFloor = (() => {
  const stations = {
    lift:{x:754,y:425}, lowerLift:{x:170,y:575}, liner:{x:842,y:221}
  };
  const walls = [
    {x:233,y:95,w:48,h:304}, {x:281,y:325,w:99,h:58},
    {x:404,y:277,w:56,h:230}, {x:515,y:131,w:55,h:295},
    {x:642,y:100,w:42,h:175}, {x:659,y:397,w:240,h:58},
    {x:879,y:280,w:43,h:97}, {x:749,y:503,w:43,h:130},
    {x:372,y:616,w:195,h:37}, {x:928,y:140,w:42,h:117}
  ];
  const track = [[170,575],[170,463],[350,463],[350,551],[601,551],[601,347],[708,347],[708,221],[842,221]];
  const chambers = [[147,560,214,171],[598,479,153,193],[739,210,207,143]];
  const lamps = [[143,460],[331,445],[485,550],[612,440],[705,351],[720,211],[856,204]];
  const pads = [[151,510],[536,568],[799,186],[636,335]];

  function trace(g,points){
    g.beginPath();
    points.forEach(({x,y},i)=>i?g.lineTo(x,y):g.moveTo(x,y));
  }

  function bake(g, marks, rails, point){
    const rng = mulberry(7619);
    for(const [x,y,w,h] of chambers){
      const p=point(x-w/2,y-h/2), size=point(w,h);
      g.fillStyle='#143039';g.fillRect(p.x,p.y,size.x,size.y);
      g.strokeStyle='#40626b';g.lineWidth=2;g.strokeRect(p.x+4,p.y+4,size.x-8,size.y-8);
      g.fillStyle='#ffffff08';
      for(let yy=12;yy<size.y;yy+=33) g.fillRect(p.x+5,p.y+yy,size.x-10,1);
    }
    for(let i=0;i<168;i++){
      const x=rng()*ARENA.w,y=rng()*ARENA.h,dx=3+rng()*16;
      g.strokeStyle=i%4?'#93c4c91e':'#aef2f367';g.lineWidth=i%4?1:2;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+dx,y-3);g.lineTo(x+dx*1.25,y+2);g.stroke();
    }
    const worldTrack=track.map(([x,y])=>point(x,y));
    g.save();g.lineJoin='round';g.lineCap='round';
    trace(g,worldTrack);g.strokeStyle='#101b21';g.lineWidth=31;g.stroke();
    g.setLineDash([5,12]);g.lineCap='butt';g.strokeStyle='#796d5e';g.lineWidth=27;g.stroke();
    g.setLineDash([]);g.strokeStyle='#819898';g.lineWidth=15;g.stroke();
    g.strokeStyle='#2b3e42';g.lineWidth=10;g.stroke();g.restore();

    for(const {x,y,w,h} of rails){
      g.fillStyle='#0c161b';g.fillRect(x+6,y+10,w,h+7);
      g.fillStyle='#273842';g.fillRect(x,y,w,h+3);
      g.fillStyle='#516573';g.fillRect(x,y-10,w,h);
      g.fillStyle='#7596a4';g.fillRect(x,y-10,w,3);
      g.fillStyle='#1a2b34';g.fillRect(x,y+h-12,w,12);
      const horizontal=w>h;
      for(let n=13;n<(horizontal?w:h)-13;n+=18){
        const a=horizontal?x+n:x+5+rng()*(w-10),b=horizontal?y+rng()*(h-7):y+n;
        const height=8+rng()*11;
        g.fillStyle=n%3?'#4e9da3':'#7cedd9';g.beginPath();
        g.moveTo(a-4,b+2);g.lineTo(a+1,b-height);g.lineTo(a+5,b+3);g.closePath();g.fill();
        g.strokeStyle='#b9f3e383';g.lineWidth=1;g.beginPath();g.moveTo(a+1,b-height+1);g.lineTo(a+2,b+2);g.stroke();
      }
    }

    for(const [x,y] of lamps){
      const p=point(x,y);
      const glow=marks.createRadialGradient(p.x,p.y,2,p.x,p.y,39);
      glow.addColorStop(0,'#ffc37b78');glow.addColorStop(1,'#ffc37b00');
      marks.fillStyle=glow;marks.fillRect(p.x-39,p.y-39,78,78);
      marks.fillStyle='#493d30';marks.fillRect(p.x-7,p.y-5,14,10);
      marks.fillStyle='#ffe2a5';marks.fillRect(p.x-4,p.y-3,8,6);
    }
    return {pads:pads.map(([x,y])=>point(x,y)),track:worldTrack};
  }

  function drawCabinet(g,p,claimed){
    const x=SX(p.x),y=SY(p.y);
    g.save();g.translate(x,y);
    g.fillStyle='#0d1e23';g.beginPath();g.ellipse(2,4,24,8,0,0,TAU);g.fill();
    g.fillStyle='#263d49';g.fillRect(-16,-21,32,23);
    g.strokeStyle='#8eb6be';g.strokeRect(-16,-21,32,23);
    g.fillStyle='#121f24';g.fillRect(-13,-17,25,14);
    if(!claimed){
      g.fillStyle='#ffe2a1';g.fillRect(-4,-17,8,13);g.fillRect(-8,-14,16,7);
      g.fillStyle='#c5834f';g.fillRect(-2,-14,4,7);
    }
    const label=claimed?'回收柜 · 已取空':'矿工缓冲衬板';
    g.font='bold 9px sans-serif';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#122026';
    g.strokeText(label,0,-26);g.fillStyle=claimed?'#a2bab8':'#ffe2a1';g.fillText(label,0,-26);g.restore();
  }

  return {stations,walls,bake,drawCabinet};
})();
