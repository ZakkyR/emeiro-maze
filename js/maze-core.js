function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

/* ink: Uint8Array(bw*bh) 1 = 塗る部分（2x2マスのブロック単位） */
export function generateMaze(inkIn, bw, bh, opt){
  const rng = mulberry32(opt.seed>>>0);
  const nb = bw*bh;
  const ink = Uint8Array.from(inkIn);
  const bridge = new Uint8Array(nb);

  // 1) 連結成分を調べて、最大の成分に他をつなぐ
  const comp = new Int32Array(nb).fill(-1);
  const sizes = [];
  const q = new Int32Array(nb);
  for(let s=0;s<nb;s++){
    if(!ink[s]||comp[s]>=0) continue;
    const id=sizes.length; let h=0,t=0; q[t++]=s; comp[s]=id; let cnt=0;
    while(h<t){const c=q[h++];cnt++;const x=c%bw,y=(c/bw)|0;
      if(x>0&&ink[c-1]&&comp[c-1]<0){comp[c-1]=id;q[t++]=c-1;}
      if(x<bw-1&&ink[c+1]&&comp[c+1]<0){comp[c+1]=id;q[t++]=c+1;}
      if(y>0&&ink[c-bw]&&comp[c-bw]<0){comp[c-bw]=id;q[t++]=c-bw;}
      if(y<bh-1&&ink[c+bw]&&comp[c+bw]<0){comp[c+bw]=id;q[t++]=c+bw;}}
    sizes.push(cnt);
  }
  if(!sizes.length) throw new Error("塗る部分が見つかりません。しきい値か反転を調整してください。");
  let big=0; for(let i=1;i<sizes.length;i++) if(sizes[i]>sizes[big]) big=i;
  const inS=new Uint8Array(nb); const merged=new Uint8Array(sizes.length); merged[big]=1;
  for(let i=0;i<nb;i++) if(comp[i]===big) inS[i]=1;
  let remaining=sizes.length-1, bridges=0;
  const prev=new Int32Array(nb);
  while(remaining>0){
    prev.fill(-2); let h=0,t=0;
    for(let i=0;i<nb;i++) if(inS[i]){prev[i]=-1;q[t++]=i;}
    let hit=-1, from=-1;
    outer: while(h<t){const c=q[h++];const x=c%bw,y=(c/bw)|0;
      const ns=[]; if(x>0)ns.push(c-1); if(x<bw-1)ns.push(c+1); if(y>0)ns.push(c-bw); if(y<bh-1)ns.push(c+bw);
      for(const n of ns){ if(prev[n]!==-2) continue;
        if(ink[n]&&!inS[n]){hit=n;from=c;break outer;}
        if(!ink[n]){prev[n]=c;q[t++]=n;} }}
    if(hit<0) throw new Error("離れた部分をつなげませんでした。");
    let c=from; while(c>=0&&!inS[c]){ink[c]=1;bridge[c]=1;inS[c]=1;c=prev[c];}
    const id=comp[hit]; for(let i=0;i<nb;i++) if(comp[i]===id) inS[i]=1;
    merged[id]=1; remaining--; bridges++;
  }

  // 2) マス単位の準備（1ブロック = 2x2マス）
  const inkList=[]; for(let i=0;i<nb;i++) if(ink[i]) inkList.push(i);
  const W=bw*2, H=bh*2, N=W*H;
  const openR=new Uint8Array(N), openD=new Uint8Array(N), reg=new Uint8Array(N), kind=new Uint8Array(N);
  const cellsOf=b=>{const bx=b%bw,by=(b/bw)|0,TL=(2*by)*W+2*bx; return [TL,TL+1,TL+W+1,TL+W];}; // 時計回り
  for(const b of inkList) for(const c of cellsOf(b)){reg[c]=1;kind[c]=bridge[b]?2:1;}
  const blockOf=c=>((((c/W)|0)>>1)*bw+((c%W)>>1));
  const gridNbrs=(c)=>{const x=c%W,y=(c/W)|0,r=[]; if(x>0)r.push(c-1); if(x<W-1)r.push(c+1); if(y>0)r.push(c-W); if(y<H-1)r.push(c+W); return r;};
  const blkNbrs=b=>{const x=b%bw,y=(b/bw)|0,r=[]; if(x>0)r.push(b-1); if(x<bw-1)r.push(b+1); if(y>0)r.push(b-bw); if(y<bh-1)r.push(b+bw); return r;};
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=(rng()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;};
  const corner={tl:0,tr:W-1,bl:(H-1)*W,br:N-1};
  const onSide=(c,side)=>{ if(side in corner) return c===corner[side];
    const x=c%W,y=(c/W)|0; return side==="top"?y===0:side==="bottom"?y===H-1:side==="left"?x===0:x===W-1;};
  // 角のときは、通路が入ってきた向きのまま外へ抜ける辺を開ける
  const openSideOf=(path,side)=>{ if(!(side in corner)) return side;
    const c=path[path.length-1], p=path.length>1?path[path.length-2]:-1;
    if(p>=0&&Math.abs(p-c)===W) return side[0]==="t"?"top":"bottom";
    return side[1]==="l"?"left":"right";};

  // 3) 入口側・出口側から背景マスを通る距離を測り、絵に入る場所と出る場所を決める
  const bq=new Int32Array(N);
  const freeDist=(side,blocked)=>{const dist=new Int32Array(N).fill(-1),par=new Int32Array(N).fill(-1);let h=0,t=0;
    for(let c=0;c<N;c++) if(onSide(c,side)&&!reg[c]&&!blocked[c]){dist[c]=0;bq[t++]=c;}
    while(h<t){const c=bq[h++]; for(const n of shuffle(gridNbrs(c))) if(dist[n]<0&&!reg[n]&&!blocked[n]){dist[n]=dist[c]+1;par[n]=c;bq[t++]=n;}}
    return {dist,par};};
  const trace=(co,par)=>{const p=[];let k=co;while(k>=0){p.push(k);k=par[k];}return p;}; // 絵の外側 → 外周
  const xyPar=c=>((c%W)+((c/W)|0))&1;
  const SD=freeDist(opt.start,new Uint8Array(N));
  // 絵に入るマスの候補（マスの色＝市松の偶奇ごとに一番近いもの）
  const sCands=[null,null]; { const bd=[1e9,1e9];
    for(let c=0;c<N;c++){ if(!reg[c]) continue; const pr=xyPar(c);
      for(const n of gridNbrs(c)) if(!reg[n]&&SD.dist[n]>=0&&(SD.dist[n]<bd[pr]||(SD.dist[n]===bd[pr]&&rng()<.3))){bd[pr]=SD.dist[n];sCands[pr]={c,n,d:SD.dist[n]};}} }
  const ctxs=[];
  for(const sE of sCands.filter(Boolean).sort((x,y)=>x.d-y.d)){
    const A=trace(sE.n,SD.par);
    const blk=new Uint8Array(N); for(const k of A) blk[k]=1;
    const GD=freeDist(opt.goal,blk);
    const goodOut=c=>{let best=-1; for(const n of gridNbrs(c)) if(!reg[n]&&!blk[n]&&GD.dist[n]>=0&&(best<0||GD.dist[n]<GD.dist[best])) best=n; return best;};
    const gBest=new Map();
    for(let c=0;c<N;c++){ if(!reg[c]) continue; const o=goodOut(c); if(o<0) continue;
      const b=blockOf(c); if(!gBest.has(b)||GD.dist[o]<gBest.get(b)) gBest.set(b,GD.dist[o]);}
    const gCands=[...gBest.entries()].sort((x,y)=>x[1]-y[1]).slice(0,6).map(e=>e[0]);
    if(gCands.length) ctxs.push({sE,A,GD,goodOut,gCands});
  }
  if(!ctxs.length) throw new Error("入口・出口までの通路を作れませんでした。余白を増やしてください。");
  const dirOf=(a,b)=> b===a+1?"right":b===a-1?"left":b===a+bw?"down":"up";
  const sideCells=(b,dir)=>{const [TL,TR,BR,BL]=cellsOf(b); return dir==="right"?[TR,BR]:dir==="left"?[TL,BL]:dir==="up"?[TL,TR]:[BL,BR];};
  const across=(c,dir)=> dir==="right"?c+1:dir==="left"?c-1:dir==="down"?c+W:c-W;
  const M=inkList.length*4;
  let result=null, best=null;

  // 4) 入口ブロックから出口ブロックへの「背骨」をランダムに選び、背骨以外は閉路にしてつなぎ込む
  const tStart=Date.now();
  for(let attempt=0;attempt<16&&!result;attempt++){
    if(best&&Date.now()-tStart>2500) break;
    const ctx=ctxs[attempt%ctxs.length]; const {sE,A,GD,goodOut,gCands}=ctx; const Sb=blockOf(sE.c);
    const Gb=gCands[((attempt/ctxs.length)|0)%gCands.length];
    let spine;
    if(Gb===Sb) spine=[Sb];
    else { // ループ消去ランダムウォーク
      const nxt=new Int32Array(nb).fill(-1); let cur=Gb, steps=0;
      while(cur!==Sb&&steps<800000){const ns=blkNbrs(cur).filter(n=>ink[n]); const n=ns[(rng()*ns.length)|0]; nxt[cur]=n; cur=n; steps++;}
      if(cur!==Sb) continue;
      spine=[]; cur=Gb; while(cur!==Sb){spine.push(cur);cur=nxt[cur];} spine.push(Sb); spine.reverse();
    }
    const inSpine=new Uint8Array(nb); for(const b of spine) inSpine[b]=1;

    // 背骨: 各ブロックの4マスを一筆で通り、次のブロックへ抜ける
    const order=[]; let a=sE.c, ok=true, gOut=-1;
    for(let i=0;i<spine.length;i++){
      const b=spine[i], cyc=cellsOf(b), k=cyc.indexOf(a);
      const cw=[cyc[k],cyc[(k+1)%4],cyc[(k+2)%4],cyc[(k+3)%4]], ccw=[cyc[k],cyc[(k+3)%4],cyc[(k+2)%4],cyc[(k+1)%4]];
      let seq;
      if(i<spine.length-1){const dir=dirOf(b,spine[i+1]); const sc=sideCells(b,dir);
        seq=sc.includes(cw[3])?cw:ccw; if(!sc.includes(seq[3])){ok=false;break;}
        a=across(seq[3],dir);
      } else {
        const o1=goodOut(cw[3]), o2=goodOut(ccw[3]);
        if(o1<0&&o2<0){ok=false;break;}
        if(o2<0||(o1>=0&&(GD.dist[o1]<GD.dist[o2]||(GD.dist[o1]===GD.dist[o2]&&rng()<.5)))){seq=cw;gOut=o1;} else {seq=ccw;gOut=o2;}
      }
      for(const c of seq) order.push(c);
    }
    if(!ok) continue;
    const nextC=new Int32Array(N).fill(-1), prevC=new Int32Array(N).fill(-1);
    for(let i=0;i+1<order.length;i++){nextC[order[i]]=order[i+1];prevC[order[i+1]]=order[i];}

    // 背骨以外: 成分ごとにランダムな全域木 → 外周をなぞる閉路
    const rest=inkList.filter(b=>!inSpine[b]); const inRest=new Uint8Array(nb); for(const b of rest) inRest[b]=1;
    const tR=new Uint8Array(nb), tD=new Uint8Array(nb), inT=new Uint8Array(nb);
    for(const st of shuffle(rest.slice())){ if(inT[st]) continue; inT[st]=1;
      const fr=[]; const pushE=x=>{for(const y of blkNbrs(x)) if(inRest[y]&&!inT[y]) fr.push(x,y);};
      pushE(st);
      while(fr.length){const k=((rng()*(fr.length/2))|0)*2; const x=fr[k],y=fr[k+1];
        fr[k]=fr[fr.length-2]; fr[k+1]=fr[fr.length-1]; fr.length-=2;
        if(inT[y]) continue; inT[y]=1;
        if(y===x+1)tR[x]=1; else if(x===y+1)tR[y]=1; else if(y===x+bw)tD[x]=1; else tD[y]=1;
        pushE(y);}}
    const lR=new Uint8Array(N), lD=new Uint8Array(N);
    for(const b of rest){const bx=b%bw,by=(b/bw)|0; const [TL,TR,BR,BL]=cellsOf(b);
      const up=by>0&&tD[b-bw], dn=tD[b], lf=bx>0&&tR[b-1], rt=tR[b];
      if(!up)lR[TL]=1; if(!dn)lR[BL]=1; if(!lf)lD[TL]=1; if(!rt)lD[TR]=1;
      if(rt){lR[TR]=1;lR[BR]=1;} if(dn){lD[BL]=1;lD[BR]=1;}}
    const lnb=c=>{const x=c%W,y=(c/W)|0,r=[];
      if(x<W-1&&lR[c])r.push(c+1); if(x>0&&lR[c-1])r.push(c-1); if(y<H-1&&lD[c])r.push(c+W); if(y>0&&lD[c-W])r.push(c-W); return r;};
    const loopId=new Int32Array(N).fill(-1), lnext=new Int32Array(N), lprev=new Int32Array(N); let nl=0;
    for(const b of rest) for(const c0 of cellsOf(b)){ if(loopId[c0]>=0) continue;
      let p=lnb(c0)[1], cur=c0;
      do{const ns=lnb(cur); const nx=ns[0]===p?ns[1]:ns[0]; loopId[cur]=nl; lnext[cur]=nx; lprev[nx]=cur; p=cur; cur=nx;}while(cur!==c0);
      nl++;}

    // 閉路を、隣り合う平行な辺のところで背骨の経路に差し込む
    const merged=new Uint8Array(nl); let remaining=nl, changed=true;
    while(changed&&remaining>0){changed=false;
      let p=order[0];
      while(p>=0){const q=nextC[p]; if(q<0) break;
        const offs=Math.abs(q-p)===1?[W,-W]:[1,-1];
        for(const o of shuffle(offs)){
          const u=p+o, v=q+o; if(u<0||v<0||u>=N||v>=N) continue;
          if(Math.abs(o)===1){const px=p%W; if(px+o<0||px+o>=W) continue;}
          const L=loopId[u]; if(L<0||merged[L]||loopId[v]!==L) continue;
          const walk=[];
          if(lnext[v]===u){let c=u; for(;;){walk.push(c); if(c===v)break; c=lnext[c];}}
          else if(lnext[u]===v){let c=u; for(;;){walk.push(c); if(c===v)break; c=lprev[c];}}
          else continue;
          let pn=p; for(const c of walk){nextC[pn]=c;prevC[c]=pn;pn=c;} nextC[pn]=q; prevC[q]=pn;
          merged[L]=1; remaining--; changed=true; break;}
        p=nextC[p];}}
    const path=[]; for(let c=order[0];c>=0;c=nextC[c]) path.push(c);
    const dropped=[]; if(remaining>0) for(let c=0;c<N;c++) if(loopId[c]>=0&&!merged[loopId[c]]) dropped.push(c);
    if(path.length+dropped.length!==M) continue;
    const cand={path,A,B:trace(gOut,GD.par),dropped};
    if(!dropped.length) result=cand; else if(!best||dropped.length<best.dropped.length) best=cand;
  }
  // 一筆でつなげない細い部分が残ったときは、そこを塗らない部分として扱う
  if(!result) result=best;
  if(!result) throw new Error("絵を一筆でなぞる経路を作れませんでした。シードや入口・出口を変えて試してください。");
  for(const c of result.dropped){reg[c]=0;kind[c]=4;}

  // 5) 入口通路 → 絵の一筆書き → 出口通路 を1本の正解ルートにする
  const A=result.A, B=result.B;
  const route=[]; for(let i=A.length-1;i>=0;i--) route.push(A[i]);
  for(const c of result.path) route.push(c);
  for(const k of B) route.push(k);
  const setOpen=(a,b,v)=>{ if(b===a+1)openR[a]=v; else if(a===b+1)openR[b]=v; else if(b===a+W)openD[a]=v; else openD[b]=v;};
  for(let i=0;i+1<route.length;i++) setOpen(route[i],route[i+1],1);
  const onPath=new Uint8Array(N); for(const k of route){onPath[k]=1; if(!kind[k])kind[k]=3;}
  const entry=route[0], exit=route[route.length-1];

  // 6) 残りのマスを行き止まりの枝で埋める（growing tree）
  const vis=Uint8Array.from(onPath); const list=new Int32Array(N); let len=0;
  const shuffled=route.slice(); for(let i=shuffled.length-1;i>0;i--){const j=(rng()*(i+1))|0;[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  for(const k of shuffled) list[len++]=k;
  const p=opt.branch;
  while(len>0){const i=rng()<p?len-1:(rng()*len)|0; const c=list[i];
    const ns=gridNbrs(c).filter(n=>!vis[n]);
    if(!ns.length){list[i]=list[len-1];len--;continue;}
    const n=ns[(rng()*ns.length)|0]; setOpen(c,n,1); vis[n]=1; list[len++]=n;}

  return {W,H,openR,openD,kind,route,entry,exit,start:openSideOf(A,opt.start),goal:openSideOf(B,opt.goal),
    stats:{dropped:result.dropped.length,bridges,routeLen:route.length,cells:N}};
}

export function buildSVG(m,o){
  const {W,H,openR,openD}=m, lw=o.line/o.cell, pad=lw;
  const isOpening=(c,side)=>(c===m.entry&&side===m.start)||(c===m.exit&&side===m.goal);
  let d="";
  for(let y=0;y<=H;y++){let run=-1;
    for(let x=0;x<=W;x++){let wall=false;
      if(x<W){ if(y===0) wall=!isOpening(x,"top"); else if(y===H) wall=!isOpening((H-1)*W+x,"bottom"); else wall=!openD[(y-1)*W+x]; }
      if(wall&&run<0) run=x; if(!wall&&run>=0){d+=`M${run} ${y}H${x}`;run=-1;}}}
  for(let x=0;x<=W;x++){let run=-1;
    for(let y=0;y<=H;y++){let wall=false;
      if(y<H){ if(x===0) wall=!isOpening(y*W,"left"); else if(x===W) wall=!isOpening(y*W+W-1,"right"); else wall=!openR[y*W+x-1]; }
      if(wall&&run<0) run=y; if(!wall&&run>=0){d+=`M${x} ${run}V${y}`;run=-1;}}}
  let fills="";
  if(o.answer){
    const paths={1:"",2:"",3:""};
    for(let y=0;y<H;y++){let x=0; while(x<W){const k=m.kind[y*W+x];
      if(k&&(k===1||m.route&&true)){ // 経路上のマスだけ塗る
        const onp=o.onPath[y*W+x]; if(!onp){x++;continue;}
        let x2=x+1; while(x2<W&&o.onPath[y*W+x2]&&m.kind[y*W+x2]===k) x2++;
        paths[k]+=`M${x} ${y}h${x2-x}v1h${x-x2}z`; x=x2; } else x++; }}
    const aux=o.fadeAux?' fill-opacity="0.35"':'';
    if(paths[1]) fills+=`<path d="${paths[1]}" fill="${o.fill}"/>`;
    if(paths[2]) fills+=`<path d="${paths[2]}" fill="${o.fill}"${aux}/>`;
    if(paths[3]) fills+=`<path d="${paths[3]}" fill="${o.fill}"${aux}/>`;
    if(o.routeLine){
      const pt=c=>`${(c%W)+.5} ${((c/W)|0)+.5}`;
      const out=(c,side)=>{const x=(c%W)+.5,y=((c/W)|0)+.5; return side==="top"?`${x} ${y-1}`:side==="bottom"?`${x} ${y+1}`:side==="left"?`${x-1} ${y}`:`${x+1} ${y}`;};
      let pl=out(m.entry,m.start)+" "+m.route.map(pt).join(" ")+" "+out(m.exit,m.goal);
      fills+=`<polyline points="${pl}" fill="none" stroke="#d6336c" stroke-width="${Math.max(lw*1.4,.15)}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  }
  const vb=`${-pad-1} ${-pad-1} ${W+2*pad+2} ${H+2*pad+2}`;
  const wmm=((W+2*pad+2)*o.cell).toFixed(2), hmm=((H+2*pad+2)*o.cell).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="${vb}">`+
    fills+`<path d="${d}" fill="none" stroke="#000" stroke-width="${lw}" stroke-linecap="square"/></svg>`;
}
