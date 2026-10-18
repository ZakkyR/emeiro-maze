import { generateMaze, buildSVG } from "./maze-core.js";

/* ---------- UI ---------- */
const $=id=>document.getElementById(id);
let src=null, maze=null, lastInk=null, dl=null, timer=0;
const margins=["mTop","mBottom","mLeft","mRight"];
const ids=["thr","inv","cols",...margins,"mLink","offX","offY","branch","start","goal","seed","cellmm","linemm","fill","fadeAux","routeLine"];

function readOpts(){return{thr:+$("thr").value,inv:$("inv").checked,cols:+$("cols").value,
  mt:+$("mTop").value,mb:+$("mBottom").value,ml:+$("mLeft").value,mr:+$("mRight").value,ox:+$("offX").value,oy:+$("offY").value,
  branch:+$("branch").value/100,start:$("start").value,goal:$("goal").value,seed:Math.max(0,parseInt($("seed").value)||0),
  cell:Math.max(.1,parseFloat($("cellmm").value)||3),line:Math.max(.01,parseFloat($("linemm").value)||.3),
  fill:$("fill").value,fadeAux:$("fadeAux").checked,routeLine:$("routeLine").checked};}

// ずらし量を余白の配分に反映する（合計は変えず、各辺は1ブロック以上残す）
function placeMargins(o){
  const ox=Math.max(1-o.ml,Math.min(o.mr-1,o.ox)), oy=Math.max(1-o.mt,Math.min(o.mb-1,o.oy));
  return {ml:o.ml+ox,mr:o.mr-ox,mt:o.mt+oy,mb:o.mb-oy,ox,oy};
}

// ずらしスライダーの範囲を、いまの余白で実際に動かせる範囲に合わせる
function fitOffsetRange(){
  for(const [id,a,b] of [["offX","mLeft","mRight"],["offY","mTop","mBottom"]]){
    const s=$(id); s.min=1-$(a).value; s.max=$(b).value-1; s.disabled=s.min===s.max;}
}

function sampleInk(o){
  const bw=o.cols/2, iw=bw-o.ml-o.mr; if(iw<3) throw new Error("余白が大きすぎます。横のマス数を増やすか余白を減らしてください。");
  const ih=Math.max(2,Math.round(iw*src.height/src.width)), bh=ih+o.mt+o.mb;
  const S=4, c=document.createElement("canvas"); c.width=iw*S; c.height=ih*S;
  const x=c.getContext("2d",{willReadFrequently:true}); x.fillStyle="#fff"; x.fillRect(0,0,c.width,c.height);
  x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high"; x.drawImage(src,0,0,c.width,c.height);
  const px=x.getImageData(0,0,c.width,c.height).data; const ink=new Uint8Array(bw*bh);
  for(let by=0;by<ih;by++)for(let bx=0;bx<iw;bx++){let s=0;
    for(let yy=0;yy<S;yy++)for(let xx=0;xx<S;xx++){const i=((by*S+yy)*c.width+bx*S+xx)*4; s+=.299*px[i]+.587*px[i+1]+.114*px[i+2];}
    let dark=s/(S*S)<o.thr; if(o.inv)dark=!dark; ink[(by+o.mt)*bw+bx+o.ml]=dark?1:0;}
  return {ink,bw,bh};
}

function drawPreview(m){
  const cv=$("preview"), sc=Math.max(1,Math.floor(560/m.W));
  cv.width=m.W*sc; cv.height=m.H*sc; const x=cv.getContext("2d");
  x.fillStyle="#fff"; x.fillRect(0,0,cv.width,cv.height);
  const col={1:"#111",2:"#4a6bdc",3:"#9fb2ee",4:"#e8590c"};
  for(let i=0;i<m.W*m.H;i++){const k=m.kind[i]; if(!k)continue; x.fillStyle=col[k]; x.fillRect((i%m.W)*sc,((i/m.W)|0)*sc,sc,sc);}
}

function render(){
  fitOffsetRange();
  const o=readOpts();
  $("thrOut").textContent=o.thr; $("colsOut").textContent=o.cols+" マス";
  for(const id of margins) $(id+"Out").textContent=$(id).value*2+" マス";
  Object.assign(o,placeMargins(o));
  $("offXOut").textContent=o.ox?(o.ox>0?"右へ ":"左へ ")+Math.abs(o.ox)*2+" マス":"中央";
  $("offYOut").textContent=o.oy?(o.oy>0?"下へ ":"上へ ")+Math.abs(o.oy)*2+" マス":"中央";
  $("branchOut").textContent=Math.round(o.branch*100);
  if(!src) return;
  const st=$("status");
  try{
    const key=[o.thr,o.inv,o.cols,o.mt,o.mb,o.ml,o.mr,o.branch,o.start,o.goal,o.seed].join();
    if(!maze||maze.key!==key||maze.src!==src){
      const {ink,bw,bh}=sampleInk(o);
      const t0=performance.now();
      const m=generateMaze(ink,bw,bh,{seed:o.seed,branch:o.branch,start:o.start,goal:o.goal});
      m.key=key; m.src=src; m.ms=performance.now()-t0;
      m.onPath=new Uint8Array(m.W*m.H); for(const k of m.route) m.onPath[k]=1;
      maze=m; drawPreview(m);
    }
    const m=maze, base={cell:o.cell,line:o.line,fill:o.fill,fadeAux:o.fadeAux,routeLine:o.routeLine,onPath:m.onPath};
    m.qSVG=buildSVG(m,{...base,answer:false}); m.aSVG=buildSVG(m,{...base,answer:true});
    $("qPaper").innerHTML=m.qSVG; $("aPaper").innerHTML=m.aSVG;
    const wmm=((m.W+2+2*o.line/o.cell)*o.cell), hmm=((m.H+2+2*o.line/o.cell)*o.cell);
    $("sizeHint").textContent=`仕上がり ${wmm.toFixed(0)} × ${hmm.toFixed(0)} mm（A5本文は約 120 × 180 mm、B5は約 150 × 220 mm）`;
    st.innerHTML=`<span>大きさ <b>${m.W} × ${m.H}</b> マス</span><span>正解ルート <b>${m.stats.routeLen}</b> マス</span>`+
      `<span>つないだ箇所 <b>${m.stats.bridges}</b></span>`+(m.stats.dropped?`<span class="err">一筆でつなげず塗らない部分 ${m.stats.dropped} マス（プレビューの橙色）</span>`:"")+
      `<span>生成 <b>${m.ms.toFixed(0)}</b> ms</span>`;
  }catch(e){ st.innerHTML=`<span class="err">${e.message}</span>`; $("qPaper").innerHTML=""; $("aPaper").innerHTML=""; maze=null; }
}
const schedule=()=>{clearTimeout(timer);timer=setTimeout(render,120);};
ids.forEach(id=>{$(id).addEventListener("input",schedule);});
// そろえる設定のときは、動かした余白の値を他の3辺にも写す
const syncMargins=v=>{if($("mLink").checked) for(const id of margins) $(id).value=v;};
margins.forEach(id=>$(id).addEventListener("input",()=>syncMargins($(id).value)));
$("mLink").addEventListener("change",()=>syncMargins($("mTop").value));
$("offReset").addEventListener("click",()=>{$("offX").value=0;$("offY").value=0;render();});
$("reroll").addEventListener("click",()=>{$("seed").value=(parseInt($("seed").value)||0)+1;render();});

function loadImageFromBlob(blob){
  const url=URL.createObjectURL(blob); const img=new Image();
  img.onload=()=>{const c=document.createElement("canvas"); const s=Math.min(1,1600/Math.max(img.width,img.height));
    c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    src=c; URL.revokeObjectURL(url); maze=null; render(); toast("画像を読み込みました");};
  img.onerror=()=>toast("この画像は読み込めませんでした");
  img.src=url;
}
$("file").addEventListener("change",e=>{const f=e.target.files[0]; if(f) loadImageFromBlob(f); e.target.value="";});
const stage=$("app");
stage.addEventListener("dragover",e=>{e.preventDefault();stage.classList.add("drop");});
stage.addEventListener("dragleave",e=>{if(e.target===stage)stage.classList.remove("drop");});
stage.addEventListener("drop",e=>{e.preventDefault();stage.classList.remove("drop");const f=[...e.dataTransfer.files].find(f=>f.type.startsWith("image/")); if(f) loadImageFromBlob(f);});
document.addEventListener("paste",e=>{const it=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith("image/")); if(it){loadImageFromBlob(it.getAsFile());}});

function textToCanvas(t){
  const font='900 400px "M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Zen Kaku Gothic New",sans-serif';
  const m=document.createElement("canvas").getContext("2d"); m.font=font;
  const w=Math.ceil(m.measureText(t).width)+80, h=520;
  const c=document.createElement("canvas"); c.width=w; c.height=h; const x=c.getContext("2d");
  x.fillStyle="#fff"; x.fillRect(0,0,w,h); x.fillStyle="#000"; x.font=font; x.textBaseline="middle"; x.fillText(t,40,h/2+10);
  // 余白を切り詰める
  const d=x.getImageData(0,0,w,h).data; let x0=w,y0=h,x1=0,y1=0;
  for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){if(d[(y*w+xx)*4]<128){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<x0) return c;
  const o=document.createElement("canvas"); o.width=x1-x0+1; o.height=y1-y0+1;
  o.getContext("2d").drawImage(c,-x0,-y0); return o;
}
async function makeFromText(){
  const t=$("text").value.trim(); if(!t) return;
  try{ await Promise.race([document.fonts.load('900 400px "M PLUS Rounded 1c"',t),new Promise(r=>setTimeout(r,2500))]); }catch(e){}
  src=textToCanvas(t); maze=null; render();
}
$("textBtn").addEventListener("click",makeFromText);
$("text").addEventListener("keydown",e=>{if(e.key==="Enter")makeFromText();});

function toast(msg){const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove("show"),1800);}
document.querySelectorAll("button[data-act]").forEach(b=>b.addEventListener("click",async()=>{
  if(!maze) return; const svg=b.dataset.which==="q"?maze.qSVG:maze.aSVG; const name=b.dataset.which==="q"?"絵迷路_問題.svg":"絵迷路_解答.svg";
  if(b.dataset.act==="copy"){
    try{await navigator.clipboard.writeText(svg); toast("SVGをコピーしました");}
    catch(e){const ta=document.createElement("textarea"); ta.value=svg; document.body.appendChild(ta); ta.select();
      let ok=false; try{ok=document.execCommand("copy");}catch(_){} ta.remove(); toast(ok?"SVGをコピーしました":"コピーできませんでした");}
  }else if(dl){
    try{await dl.save({filename:name,data:svg}); toast("保存しました");}
    catch(e){ if(e&&e.code!=="declined") toast("保存できませんでした（"+(e.code||"error")+"）"); }
  }else{
    const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
    const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}));
(async()=>{ try{ if(window.claude&&window.claude.use){ dl=await window.claude.use("downloads"); } }catch(e){dl=null;}
  document.querySelectorAll('button[data-act="save"]').forEach(b=>b.hidden=false); })();

render(); makeFromText();
