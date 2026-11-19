'use strict';

const BossEffects = (() => {
  // Field, edge and core colors are separate so geometry survives low quality.
  const pal = {
    bulwark: ['#51301d','#f1ac55','#fff0bd','#221621'],
    crusher: ['#562724','#ff9a62','#fff0c2','#261826'],
    hive:    ['#243760','#62d8f6','#ecfcff','#1a1831'],
    prism:   ['#1a4d4b','#81f5d0','#fbfff0','#172536'],
    frost:   ['#2c4b73','#9feaff','#f1ffff','#18253f'],
    molten:  ['#671e20','#ff853e','#fff0a5','#291225'],
    void:    ['#452153','#dd88ff','#fff0ff','#240e36']
  };
  const TAU = Math.PI * 2;
  const spokes = Array.from({ length:24 }, (_,i) => [Math.cos(i/24*TAU),Math.sin(i/24*TAU)]);
  const cap = a => Math.max(0,Math.min(1,a));

  function disk(g,r,x=0,y=0){
    g.beginPath();
    g.arc(x,y,Math.max(0,r),0,TAU);
  }
  function line(g,c,w,x,y,dx,dy){
    g.strokeStyle=c;
    g.lineWidth=w;
    g.beginPath();
    g.moveTo(x,y);
    g.lineTo(dx,dy);
    g.stroke();
  }
  function shape(g,c,...points){
    g.fillStyle=c;
    g.beginPath();
    g.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2) g.lineTo(points[i],points[i+1]);
    g.closePath();
    g.fill();
  }
  function chip(g,c,x,y,n){
    shape(g,c,x,y-n,x+n,y,x,y+n,x-n,y);
  }
  function anchor(g,x,y){
    g.save();
    g.translate(SX(x),SY(y));
    g.scale(1,KZ);
  }
  function segment(g,x,y,angle){
    anchor(g,x,y);
    g.rotate(angle);
  }
  function rim(g,r,edge,shadow,alpha=.95){
    disk(g,r);
    g.globalAlpha=alpha;
    g.strokeStyle=shadow;
    g.lineWidth=4.2;
    g.stroke();
    g.strokeStyle=edge;
    g.lineWidth=1.9;
    g.stroke();
  }
  function brackets(g,r,p,k){
    const step=QLEVEL ? 3 : 6;
    for(let i=0;i<24;i+=step){
      g.save();
      g.rotate(i*TAU/24);
      const n = 7+5*k;
      shape(g,p[1],r-1,-n,r+1,-n,r+1,n,r-1,n,r-1,n+3,r-4,n+3,r-4,-n-3,r-1,-n-3);
      line(g,p[2],1.5,r-1,-n*.55,r-1,n*.55);
      g.restore();
    }
  }
  function target(g,x,y,r,kind,progress){
    const p=pal[kind], k=cap(progress);
    anchor(g,x,y);
    disk(g,r);
    g.globalAlpha=.52+k*.19;
    g.fillStyle=p[0];
    g.fill();
    rim(g,r,p[1],p[3]);
    brackets(g,r,p,k);
    g.globalAlpha=.44+k*.42;
    const q=r*(.87-.55*k);
    for(let i=0;i<24;i+=6){
      g.save();
      g.rotate((i+3)*TAU/24);
      shape(g,p[2],q-6,0,q+4,-6,q+2,0,q+4,6);
      g.restore();
    }
    g.globalAlpha=.70;
    const width=5+k*4;
    line(g,p[2],1.55,-width,0,width,0);
    line(g,p[2],1.55,0,-width,0,width);
    g.restore();
  }

  function lane(g,p,len,r,warning,t,fade=1){
    g.beginPath();
    g.moveTo(0,-r);
    g.lineTo(len,-r);
    g.arc(len,0,r,-Math.PI/2,Math.PI/2);
    g.lineTo(0,r);
    g.arc(0,0,r,Math.PI/2,Math.PI*1.5);
    g.closePath();
    g.fillStyle=p[0];
    g.globalAlpha=warning ? .59 : .73;
    g.fill();
    g.globalAlpha=.92;
    g.strokeStyle=p[3];
    g.lineWidth=3.8;
    g.stroke();
    g.strokeStyle=p[1];
    g.lineWidth=1.9;
    g.stroke();
    const interval=QLEVEL ? 44 : 73;
    const offset=warning ? 10 + t*24 : 12 + (t*133)%interval;
    const right=Math.min(len-13,Math.hypot(VW,VH/KZ)+42);
    const h=r*.53;
    for(let x=offset;x<right;x+=interval){
      g.globalAlpha=warning ? .47+t*.43 : .85*fade;
      shape(g,p[1],x-10,-h,x+5,-h*(warning?.36:1),x+15,0,x+5,h*(warning?.36:1),x-10,h,x,0);
      g.globalAlpha=warning ? .7 : .95*fade;
      shape(g,p[2],x-5,-h*.48,x+7,0,x-5,h*.48,x-1,0);
    }
    g.globalAlpha=1;
  }

  function charge(g,b,x,y,goal,color){
    const a=b.act, p=pal[b.kind];
    const len=Math.hypot(goal.x-x,goal.y-y);
    const angle=Math.atan2(goal.y-y,goal.x-x);
    segment(g,x,y,angle);
    if(!a.fired){
      lane(g,p,len,b.r,true,cap((a.t || 0)/a.wind));
      chip(g,p[2],len,0,5);
    } else {
      const covered=Math.hypot(b.x-x,b.y-y);
      const span=Math.min(99,covered);
      const start=covered-span;
      g.globalAlpha=.60;
      shape(g,p[3],start,0,covered-12,-16,covered+2,-11,covered+2,12,covered-15,19);
      g.globalAlpha=.74;
      for(let i=0;i<(QLEVEL ? 7 : 4);i++){
        const offset=i*13+Math.floor((a.t-a.wind)*90)%13;
        if(offset>span) break;
        const bx=covered-offset, by=(i%2 ? 1 : -1)*(8+i*1.6);
        shape(g,i%3 ? p[1] : color,bx-10,by+2,bx-2,by-3,bx+7,by-2,bx+2,by+3);
      }
    }
    g.restore();
  }

  function beam(g,h,kind,warning,progress=0){
    const p=pal[kind], len=h.len, r=h.wide;
    const fade=warning ? 1 : cap(h.life/.23), rise=warning ? 1 : cap(h.t/.085);
    segment(g,h.x,h.y,h.ang);
    lane(g,p,len,r,warning,warning ? cap(progress) : h.t,fade);
    if(warning){
      g.globalAlpha=.85;
      g.setLineDash([9,9]);
      line(g,p[2],1.3,0,0,len,0);
    } else {
      g.globalAlpha=.66+.32*fade;
      line(g,p[1],Math.max(3,r*(.35+.72*rise*fade)),0,0,len,0);
      line(g,p[2],1.65+r*.25*fade,0,0,len,0);
      const step=QLEVEL ? 43 : 75;
      const right=Math.min(len-12,Math.hypot(VW,VH/KZ)+42);
      const phase=(h.t*(kind==='void' ? 230 : 145))%step;
      for(let k=16+phase;k<right;k+=step){
        g.globalAlpha=.54;
        if(kind==='prism'){
          const edge=r*.69;
          shape(g,p[2],k-12,-edge,k+2,-edge,k+15,edge,k+12,edge);
        } else if(kind==='void'){
          const fold=.53+.19*Math.sin(k*.065-h.t*15);
          shape(g,p[3],k-14,-r*.84,k+12,-r*.79,k+2,-r*fold,k-5,-r*.27);
          shape(g,p[1],k-15,r*.73,k+3,r*.24,k+14,r*.71,k+2,r*.81);
          g.globalAlpha=.77*fade;
          shape(g,p[2],k-6,r*.58,k+12,r*.27,k+1,r*.80);
        } else {
          line(g,p[2],1.65,k-10,r*.73,k+13,r*.73);
          line(g,p[2],1.65,k-10,-r*.73,k+13,-r*.73);
        }
      }
    }
    g.restore();
  }

  function pool(g,h){
    const p=pal[h.bossFx], r=h.r, ice=h.bossFx==='frost';
    const age=cap((h.t-h.arm)/.32), fade=.60+.4*cap(h.life/.65);
    anchor(g,h.x,h.y);
    g.globalAlpha=(.73+.21*age)*fade;
    disk(g,r);
    g.fillStyle=p[0];
    g.fill();
    g.save();
    g.clip();
    const step=QLEVEL ? 2 : 4;
    const phase=Math.floor(h.t*12);
    for(let i=0;i<24;i+=step){
      const [dx,dy]=spokes[i], [ax,ay]=spokes[(i+3)%24];
      const inner=r*(.12+((i*7)%11)*.041), outer=r*(.59+(i%5)*.092);
      const x=dx*inner, y=dy*inner;
      g.globalAlpha=(.35+.44*age)*fade;
      if(ice){
        shape(g,i%3 ? p[1] : p[3],x,y,dx*outer,dy*outer,ax*outer*.78,ay*outer*.78);
        const bx=dx*outer*.68, by=dy*outer*.68;
        const rise=(7+(i*7)%14)*(.46+.54*age), width=3+(i%4);
        g.globalAlpha=.88*fade;
        shape(g,p[3],bx-width-2,by,bx+width,by-2,bx+width*2,by+2,bx+1,by+5);
        shape(g,'#588da9',bx-width,by,bx+2,by-rise,bx+width+2,by-3,bx+1,by+3);
        shape(g,p[2],bx-width,by,bx+2,by-rise,bx+1,by-3);
      } else {
        const bx=dx*outer, by=dy*outer;
        const kx=x+(bx-x)*.57-ax*5, ky=y+(by-y)*.64-ay*5;
        shape(g,p[3],x,y,kx,ky,bx+ax*5,by+ay*5,ax*outer*.69,ay*outer*.69);
        g.beginPath();
        g.moveTo(x,y);
        g.lineTo(kx,ky);
        g.lineTo(kx+dy*5,ky-dx*5);
        g.lineTo(bx,by);
        g.strokeStyle=p[1];
        g.lineWidth=2.7;
        g.stroke();
        g.globalAlpha=.8*fade;
        const shift=((phase+i*7)%12)/12;
        g.fillStyle=shift>.52 ? p[2] : p[1];
        g.fillRect(Math.round(x+(bx-x)*shift-1),Math.round(y+(by-y)*shift),2,2);
        if(QLEVEL && shift>.3 && shift<.75){
          g.globalAlpha=(.79-shift)*fade;
          g.fillRect(Math.round(kx+dy*shift*16),Math.round(ky-dx*shift*16-7),2,3);
        }
      }
    }
    g.restore();
    rim(g,r,p[1],p[3]);
    g.restore();
  }

  function wave(g,h){
    const p=pal[h.bossFx], r=h.r, w=SHOCKWAVE_HALF_WIDTH;
    anchor(g,h.x,h.y);
    disk(g,r);
    g.globalAlpha=.85;
    g.lineWidth=w*2+3;
    g.strokeStyle=p[3];
    g.stroke();
    g.strokeStyle=p[1];
    g.lineWidth=w*2;
    g.stroke();
    g.strokeStyle=p[2];
    g.lineWidth=2;
    g.stroke();
    const step=QLEVEL ? 2 : 4;
    for(let i=0;i<24;i+=step){
      g.save();
      g.rotate(i*TAU/24+h.t*.6);
      shape(g,i%3 ? p[0] : p[2],r-w+1,-4,r+w-2,-8,r+2,1,r+w-3,4,r-4,6);
      g.restore();
    }
    g.restore();
  }

  function emit(kind,style,x,y,r){
    const life=style==='launch' ? .43 : style==='rift' ? .42 : .54;
    G.rings.push({ bossFx:kind, style,x,y,r,life,maxLife:life });
  }

  function echo(g,h){
    const p=pal[h.bossFx], u=cap(1-h.life/h.maxLife), r=h.r;
    anchor(g,h.x,h.y);
    if(h.style==='launch' || h.style==='rift'){
      const rift=h.style==='rift';
      const n=r*(.34+u*.66);
      g.globalAlpha=(1-u)*.68;
      shape(g,p[1],-n,0,0,-n, n,0,0,n);
      shape(g,p[3],-n*.72,0,0,-n*.82,n*.72,0,0,n*.75);
      for(let i=0;i<6;i++){
        const x=(i%2 ? -1 : 1)*(n*.2+i*2), y=-(rift ? 29 : 42)*u-i*2;
        g.globalAlpha=(1-u)*.95;
        chip(g,i%2 ? p[1] : p[2],x,y,2+i%3);
      }
    } else {
      const step=QLEVEL ? 2 : 4;
      for(let i=0;i<24;i+=step){
        g.save();
        g.rotate((i+.15)*TAU/24);
        const radius=r*(.67+u*.27), tip=radius*(.78+(i%5)*.053);
        const width=6+(i%3)*4;
        g.globalAlpha=(1-u)*.80;
        shape(g,p[3],0,0,radius*.49,-width,tip,-width*.62,radius*.65,width*.37,tip,width,radius*.43,width);
        shape(g,p[1],radius*.30,width*.63,tip,-width*.26,radius*.57,width*.40,tip,width);
        if(u<.62){
          g.globalAlpha=1-u*1.3;
          chip(g,p[2],radius*.65,-width-9*u,2+((i+1)%3));
        }
        g.restore();
      }
      if(u<.36){
        g.globalAlpha=.7*(1-u/.36);
        const inner=r*(.16+u*1.38);
        shape(g,p[1],-inner,0,-inner*.6,-inner*.44,0,-inner*.55,inner*.65,-inner*.40,inner,0,inner*.65,inner*.32,0,inner*.45,-inner*.7,inner*.35);
        chip(g,p[2],0,0,Math.max(3,inner*.44));
      }
    }
    g.restore();
  }

  function cast(g,b){
    const a=b.act, p=pal[b.kind], since=G.t-(b.muzzleAt ?? -1);
    if(!a && since>.18) return;
    const wind=a && !a.fired ? cap((a.t || 0)/a.wind) : 0;
    const lift=a?.visual==='spawnDrones' || a?.visual==='prismSummon';
    const pulsing=since<.16;
    const release=a?.fired ? cap(1-(a.t-a.wind)/.38) : 0;
    if(wind===0 && !pulsing && (!lift || release===0)) return;
    const shell=(b.muzzleStyle==='vent' && pulsing) || a?.visual==='shell' || a?.visual==='shells';
    const flame=b.kind==='molten' && a?.visual==='flame';
    const forward=shell || flame;
    const x=SX(b.x)+(forward ? b.face*b.r*.50 : 0);
    const y=SY(b.y)-b.h*(lift ? .35 : b.kind==='void' ? .86 : .67);
    g.save();
    g.translate(x,y);
    const n=5+b.r*(.23+wind*.24);
    if(wind>0){
      g.globalAlpha=.38+wind*.48;
      const step=QLEVEL ? 4 : 6;
      for(let i=0;i<24;i+=step){
        const angle=(i/24*TAU)+(a.t || 0)*(b.kind==='void' ? -1.8 : 1);
        g.save();
        g.rotate(angle);
        const r=n+(1-wind)*13;
        shape(g,p[1],r,-2,r+7,-4,r+4,0,r+7,4,r,2,r-3,0);
        if(wind>.48) chip(g,p[2],r-4,0,1.5+wind);
        g.restore();
      }
    }
    if(pulsing && forward){
      const angle=b.muzzleAng, age=since/.16, size=(1-age)*(flame ? 22 : 29);
      g.rotate(Math.atan2(Math.sin(angle)*KZ,Math.cos(angle)));
      g.globalAlpha=.93*(1-age);
      shape(g,p[1],-4,0,2,-8,size*.60,-4,size+6,0,size*.56,5,2,8);
      shape(g,p[2],-4,0,5,-5,size*.74,0,4,4);
      if(QLEVEL) for(let i=0;i<4;i++) chip(g,p[1],5+age*38+i*4,(i-1.5)*age*16,1.5);
    } else if(pulsing || (lift && release>.03)){
      const progress=pulsing ? since/.16 : 1-release;
      g.globalAlpha=(1-progress)*.85;
      const step=QLEVEL ? 3 : 6, spread=n*(.51+progress*.9);
      for(let i=0;i<24;i+=step){
        const [dx,dy]=spokes[i];
        const px=dx*spread, py=dy*spread*(lift ? .29 : .72)+(lift ? progress*14 : 0);
        if(b.kind==='frost') shape(g,p[1],px-3,py+3,px+dx*7,py+dy*9,px+4,py+2,px,py+5);
        else chip(g,i%2 ? p[1] : p[2],px,py,2.4);
      }
    }
    g.restore();
  }

  return { target, charge, beam, pool, wave, emit, echo, cast };
})();
