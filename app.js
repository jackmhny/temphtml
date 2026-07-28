(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const D={easy:{n:6,label:'Easy',base:3500},classic:{n:8,label:'Classic',base:6000},hard:{n:10,label:'Hard',base:9000}};
const KEY='stardoku-v3',DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
let profile=load(),selected=profile.selected||'classic',g=null,timer=null,pending=new Map(),toastTimer,starting=false,drag=null;

function defaults(){return{levels:{easy:1,classic:1,hard:1},solved:0,total:0,streak:0,best:0,selected:'classic'}}
function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'{}'),base=defaults();return{...base,...raw,levels:{...base.levels,...(raw.levels||{})}}}catch{return defaults()}}
function save(){localStorage.setItem(KEY,JSON.stringify(profile))}
function rng(seed){let x=seed>>>0;return()=>{x=(x+0x6D2B79F5)>>>0;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function shuffle(a,r){for(let i=a.length-1;i;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function randomSeed(){try{const a=new Uint32Array(2);crypto.getRandomValues(a);return a[0].toString(36)+a[1].toString(36)}catch{return(Date.now().toString(36)+Math.random().toString(36).slice(2,10))}}
function neighbors(i,n){const r=Math.floor(i/n),c=i%n,out=[];for(const[dr,dc]of DIRS){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<n&&cc>=0&&cc<n)out.push(rr*n+cc)}return out}

function randomSolution(n,r){const sol=[],used=Array(n).fill(false);function go(row){if(row===n)return true;const cand=shuffle([...Array(n).keys()],r);for(const c of cand){if(used[c]||(row&&Math.abs(c-sol[row-1])<2))continue;used[c]=true;sol.push(c);if(go(row+1))return true;sol.pop();used[c]=false}return false}if(go(0))return sol;let out=[...Array(n).keys()].filter(x=>x%2===0).concat([...Array(n).keys()].filter(x=>x%2===1));if(r()<.5)out.reverse();if(r()<.5)out=out.map(c=>n-1-c);return out}
function connected(reg,n,id){const start=reg.indexOf(id);if(start<0)return false;const seen=new Set([start]),stack=[start];while(stack.length){const i=stack.pop();for(const j of neighbors(i,n))if(reg[j]===id&&!seen.has(j)){seen.add(j);stack.push(j)}}let total=0;for(const v of reg)if(v===id)total++;return seen.size===total}
function articulationPoints(reg,n,id){const N=n*n,disc=Array(N).fill(-1),low=Array(N).fill(0),parent=Array(N).fill(-1),art=new Set();let time=0;function dfs(u){disc[u]=low[u]=time++;let children=0;for(const v of neighbors(u,n)){if(reg[v]!==id)continue;if(disc[v]<0){parent[v]=u;children++;dfs(v);low[u]=Math.min(low[u],low[v]);if(parent[u]<0&&children>1)art.add(u);if(parent[u]>=0&&low[v]>=disc[u])art.add(u)}else if(v!==parent[u])low[u]=Math.min(low[u],disc[v])}}const start=reg.indexOf(id);if(start>=0)dfs(start);return art}
function candidateScore(sizes,n){let score=0,max=0;for(const s of sizes){score+=(s-n)*(s-n);max=Math.max(max,s)}return score+max*2}
function buildCandidate(n,seed){const r=rng(seed),last=n-1;let sol,reg,anchors,colRank;
for(let attempt=0;attempt<24;attempt++){sol=randomSolution(n,r);anchors=sol.map((c,row)=>row*n+c);reg=Array(n*n).fill(last);for(let k=0;k<last;k++)reg[anchors[k]]=k;if(connected(reg,n,last))break}
if(!reg||!connected(reg,n,last)){sol=[...Array(n).keys()].filter(x=>x%2===0).concat([...Array(n).keys()].filter(x=>x%2===1));anchors=sol.map((c,row)=>row*n+c);reg=Array(n*n).fill(last);for(let k=0;k<last;k++)reg[anchors[k]]=k}
colRank=Array(n);for(let row=0;row<n;row++)colRank[sol[row]]=row;
const sizes=Array(n).fill(1);sizes[last]=n*n-last;
for(let guard=0;guard<n*n*4;guard++){
const art=articulationPoints(reg,n,last),moves=[];
for(let i=0;i<reg.length;i++){
if(reg[i]!==last||i===anchors[last]||art.has(i))continue;
const row=Math.floor(i/n),col=i%n,adj=new Map();
for(const j of neighbors(i,n)){const k=reg[j];if(k===last)continue;if(row<k||colRank[col]<k)adj.set(k,(adj.get(k)||0)+1)}
for(const[k,touch]of adj){const before=(sizes[k]-n)*(sizes[k]-n)+(sizes[last]-n)*(sizes[last]-n);const after=(sizes[k]+1-n)*(sizes[k]+1-n)+(sizes[last]-1-n)*(sizes[last]-1-n);const delta=after-before;if(delta<0)moves.push({i,k,score:delta-touch*.22+r()*.35})}
}
if(!moves.length)break;moves.sort((a,b)=>a.score-b.score);const best=moves[0].score,top=moves.filter(m=>m.score<=best+.8).slice(0,8),move=top[Math.floor(r()*top.length)];reg[move.i]=move.k;sizes[move.k]++;sizes[last]--;
}
return{n,sol,reg,sizes,score:candidateScore(sizes,n)}
}
function mapCoord(row,col,n,t){if(t>=4)col=n-1-col;for(let k=0;k<t%4;k++){const nr=col,nc=n-1-row;row=nr;col=nc}return[row,col]}
function transformPuzzle(p,t,r){const{n}=p,reg=Array(n*n),sol=Array(n);for(let row=0;row<n;row++)for(let col=0;col<n;col++){const[nr,nc]=mapCoord(row,col,n,t);reg[nr*n+nc]=p.reg[row*n+col]}for(let row=0;row<n;row++){const[nr,nc]=mapCoord(row,p.sol[row],n,t);sol[nr]=nc}return{n,reg,sol,order:shuffle([...Array(n).keys()],r),sizes:p.sizes}}
function make(d,seed){const n=D[d].n,base=hash(`${d}:${seed}:stardoku-v5`),tries=n===10?6:5;let best=null;for(let i=0;i<tries;i++){const c=buildCandidate(n,(base^Math.imul(i+1,0x9E3779B9))>>>0);if(!best||c.score<best.score)best=c}const r=rng(base^0xA5A5A5A5);return transformPuzzle(best,Math.floor(r()*8),r)}
function countSolutions(reg,n,limit=2){let count=0,usedC=0,usedR=0;function go(row,prev){if(count>=limit)return;if(row===n){count++;return}for(let col=0;col<n;col++){const cb=1<<col,rb=1<<reg[row*n+col];if((usedC&cb)||(usedR&rb)||(row&&Math.abs(col-prev)<2))continue;usedC|=cb;usedR|=rb;go(row+1,col);usedC^=cb;usedR^=rb}}go(0,-99);return count}
function validatePuzzle(p){const{n,sol,reg}=p;if(sol.length!==n||new Set(sol).size!==n)return false;for(let row=1;row<n;row++)if(Math.abs(sol[row]-sol[row-1])<2)return false;const seenRegions=new Set();for(let row=0;row<n;row++)seenRegions.add(reg[row*n+sol[row]]);if(seenRegions.size!==n)return false;for(let k=0;k<n;k++)if(!connected(reg,n,k))return false;return countSolutions(reg,n,2)===1}

function mini(){const p=[1,1,3,3,5,1,1,3,5,5,7,7,3,5,5,7,2,2,2,4,7,2,4,4,4],stars=new Set([2,5,13,16,24]);$('#mini').innerHTML=p.map((v,i)=>`<span class="p${v}">${stars.has(i)?'★':'×'}</span>`).join('')}
function renderIntro(){$$('.mode').forEach(b=>b.setAttribute('aria-pressed',b.dataset.d===selected));for(const d in D)$(`[data-level="${d}"]`).textContent=`Level ${profile.levels[d]}`;$('#start').textContent=`Start level ${profile.levels[selected]}`;$('#start').disabled=false;$('#solved').textContent=profile.solved;$('#total').textContent=profile.total.toLocaleString();$('#best').textContent=profile.best;$('#intro').hidden=false;$('#gameview').hidden=true;$('#complete').classList.remove('open');stopTimer();clearPending();drag=null;starting=false}
function start(d=selected,level=profile.levels[d],seed=randomSeed(),challengeTime=null,shared=false){if(starting)return;starting=true;clearPending();const button=$('#start');if(!$('#intro').hidden){button.disabled=true;button.textContent='Generating…'}requestAnimationFrame(()=>setTimeout(()=>{try{const p=make(d,seed);g={d,level,seed:String(seed),challengeTime:Number.isFinite(challengeTime)&&challengeTime>0?Math.floor(challengeTime):null,shared,p,cells:Array(p.n*p.n).fill(0),strikes:3,hints:2,moves:0,start:performance.now(),finalTime:null,done:false};renderBoard();$('#intro').hidden=true;$('#gameview').hidden=false;window.scrollTo(0,0);startTimer()}catch(err){console.error(err);toast('Level generation error');renderIntro()}finally{starting=false}},20))}
function resetCurrent(message='Level reset'){if(!g)return;clearPending();drag=null;g.cells.fill(0);g.strikes=3;g.hints=2;g.moves=0;g.start=performance.now();g.finalTime=null;g.done=false;$('#complete').classList.remove('open');renderBoard();startTimer();toast(message)}
function renderBoard(){const{n,reg,order}=g.p,b=$('#board');b.style.setProperty('--n',n);b.classList.remove('dragging');b.innerHTML='';for(let row=0;row<n;row++)for(let col=0;col<n;col++){const i=row*n+col,region=reg[i],e=document.createElement('button');e.className=`cell p${order[region]}`;e.dataset.i=i;e.dataset.state='blank';e.setAttribute('role','gridcell');e.setAttribute('aria-label',`Row ${row+1}, column ${col+1}`);if(!row||reg[i-n]!==region)e.classList.add('bt');if(!col||reg[i-1]!==region)e.classList.add('bl');if(col===n-1)e.classList.add('lastc');if(row===n-1)e.classList.add('lastr');e.innerHTML='<span class="x">×</span><span class="star">★</span>';b.appendChild(e)}$('#diff').textContent=`${D[g.d].label} / ${n}×${n}`;$('#level').textContent=g.shared?'LINK':String(g.level).padStart(3,'0');$('#challengeTarget').hidden=!g.challengeTime;$('#challengeTarget').textContent=g.challengeTime?`Beat ${format(g.challengeTime)}`:'';setMsg(g.challengeTime?`Challenge: beat ${format(g.challengeTime)}.`:'Tap × · double tap ★ · drag to mark');ui()}

function clearPending(){for(const v of pending.values())clearTimeout(v.id);pending.clear()}
function queueTap(i){if(!g||g.done)return;const now=performance.now(),old=pending.get(i);if(old&&now-old.t<390){clearTimeout(old.id);pending.delete(i);star(i);return}const id=setTimeout(()=>{pending.delete(i);mark(i)},300);pending.set(i,{t:now,id})}
function mark(i){if(!g||g.done)return;g.cells[i]=g.cells[i]===1?0:1;g.moves++;cell(i);ui()}
function paintX(i,mode){if(!g||g.done||drag?.visited.has(i)||g.cells[i]===2)return;if(drag)drag.visited.add(i);const next=mode?1:0;if(g.cells[i]!==next){g.cells[i]=next;g.moves++;cell(i)}}
function paintLine(a,b,mode){const n=g.p.n,r0=Math.floor(a/n),c0=a%n,r1=Math.floor(b/n),c1=b%n,steps=Math.max(Math.abs(r1-r0),Math.abs(c1-c0));for(let s=0;s<=steps;s++){const row=Math.round(r0+(r1-r0)*(steps?s/steps:0)),col=Math.round(c0+(c1-c0)*(steps?s/steps:0));paintX(row*n+col,mode)}ui()}
function cellAtPoint(x,y){const e=document.elementFromPoint(x,y)?.closest?.('.cell');return e&&$('#board').contains(e)?e:null}
function pointerDown(e){const cell=e.target.closest('.cell');if(!cell||!g||g.done||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();drag={id:e.pointerId,start:+cell.dataset.i,last:+cell.dataset.i,x:e.clientX,y:e.clientY,moved:false,mode:null,visited:new Set()};try{$('#board').setPointerCapture(e.pointerId)}catch{}}
function pointerMove(e){if(!drag||e.pointerId!==drag.id||!g||g.done)return;const cell=cellAtPoint(e.clientX,e.clientY),i=cell?+cell.dataset.i:drag.last,dist=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);if(!drag.moved&&(i!==drag.start||dist>8)){drag.moved=true;drag.mode=g.cells[drag.start]===1?0:1;clearPending();$('#board').classList.add('dragging');paintLine(drag.start,i,drag.mode)}else if(drag.moved&&i!==drag.last)paintLine(drag.last,i,drag.mode);drag.last=i}
function pointerUp(e){if(!drag||e.pointerId!==drag.id)return;pointerMove(e);const wasMoved=drag.moved,startIndex=drag.start;try{$('#board').releasePointerCapture(e.pointerId)}catch{}$('#board').classList.remove('dragging');drag=null;if(!wasMoved)queueTap(startIndex)}
function pointerCancel(e){if(!drag||e.pointerId!==drag.id)return;$('#board').classList.remove('dragging');drag=null}

function star(i,fromHint=false){if(!g||g.done)return;const n=g.p.n,row=Math.floor(i/n),ok=g.p.sol[row]===i%n;if(g.cells[i]===2){g.cells[i]=0;g.moves++;cell(i);ui();return}if(!ok&&!fromHint){wrong(i);return}g.cells[i]=2;g.moves++;cell(i);ui();if(g.cells.filter(x=>x===2).length===n)completeLevel()}
function wrong(i){g.strikes--;g.moves++;const e=$(`.cell[data-i="${i}"]`);e?.classList.add('flash');setTimeout(()=>e?.classList.remove('flash'),380);ui();if(g.strikes){setMsg(`Wrong square. ${g.strikes} strike${g.strikes===1?'':'s'} left.`,'err');toast(`${g.strikes} strike${g.strikes===1?'':'s'} left`)}else{setMsg('Out of strikes. Restarting…','err');setTimeout(()=>{if(g&&!g.done)resetCurrent('Level restarted · 3 strikes')},700)}}
function hint(){if(!g||g.done||!g.hints)return;const n=g.p.n,choices=[];for(let row=0;row<n;row++){const i=row*n+g.p.sol[row];if(g.cells[i]!==2)choices.push(i)}if(!choices.length)return;g.hints--;star(choices[Math.floor(Math.random()*choices.length)],true);setMsg('A correct star was placed.')}
function cell(i){const e=$(`.cell[data-i="${i}"]`);if(e)e.dataset.state=g.cells[i]===1?'x':g.cells[i]===2?'star':'blank'}
function elapsed(){if(!g)return 0;return g.finalTime??Math.floor((performance.now()-g.start)/1000)}
function points(){return Math.max(100,D[g.d].base-elapsed()*4-(3-g.strikes)*200-(2-g.hints)*250-g.moves*3)}
function ui(){if(!g)return;const n=g.p.n,placed=g.cells.filter(x=>x===2).length;$('#stars').textContent=`${placed} / ${n} stars`;$('#score').textContent=points().toLocaleString();$('#hint').textContent=`Hint · ${g.hints}`;$('#hint').disabled=!g.hints||g.done;$$('.strike').forEach((e,i)=>e.classList.toggle('lost',i>=g.strikes));$('#time').textContent=format(elapsed())}
function format(s){s=Math.max(0,Math.floor(Number(s)||0));return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function completeLevel(){g.finalTime=Math.floor((performance.now()-g.start)/1000);g.done=true;stopTimer();const p=points();profile.total+=p;profile.solved++;profile.streak++;profile.best=Math.max(profile.best,profile.streak);if(!g.shared)profile.levels[g.d]=Math.max(profile.levels[g.d],g.level+1);save();let text=`${p.toLocaleString()} points · ${format(g.finalTime)} · ${g.strikes} strike${g.strikes===1?'':'s'} left`;if(g.challengeTime){const delta=g.finalTime-g.challengeTime;text+=delta<0?` · ${format(-delta)} faster`:delta===0?' · tied the challenge':` · ${format(delta)} slower`}setMsg('Level complete.','ok');$('#result').textContent=text;$('#complete').classList.add('open')}
function setMsg(t,c=''){$('#msg').textContent=t;$('#msg').className='msg'+(c?' '+c:'')}
function toast(t){clearTimeout(toastTimer);$('#toast').textContent=t;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),1500)}
function startTimer(){stopTimer();timer=setInterval(ui,1000)}function stopTimer(){clearInterval(timer);timer=null}

function levelUrl(withTime=false){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('d',g.d);u.searchParams.set('s',g.seed);if(withTime)u.searchParams.set('t',String(g.finalTime));return u.toString()}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();let ok=false;try{ok=document.execCommand('copy')}catch{}area.remove();return ok}}
async function copyLevel(){if(!g?.done)return;const ok=await copyText(levelUrl(false));toast(ok?'Level link copied':'Could not copy link')}
async function shareChallenge(){if(!g?.done)return;const url=levelUrl(true),text=`I solved ${g.p.n}×${g.p.n} Stardoku in ${format(g.finalTime)}. Beat my time: ${url}`;if(navigator.share){try{await navigator.share({title:'Stardoku challenge',text});return}catch(err){if(err?.name==='AbortError')return}}const ok=await copyText(text);toast(ok?'Challenge copied':'Could not share challenge')}
function clearSharedUrl(){try{history.replaceState(null,'',location.pathname)}catch{}}
function goHome(){clearSharedUrl();renderIntro()}
function parseShared(){const q=new URLSearchParams(location.search),d=q.get('d'),seed=q.get('s');if(!D[d]||!seed||seed.length>80)return null;const t=Number.parseInt(q.get('t')||'',10);return{d,seed,target:Number.isFinite(t)&&t>0?t:null}}

$$('.mode').forEach(b=>b.onclick=()=>{selected=b.dataset.d;profile.selected=selected;save();renderIntro()});
$('#start').onclick=()=>start(selected,profile.levels[selected],randomSeed(),null,false);
$('#home').onclick=goHome;
$('#reset').onclick=()=>resetCurrent('Level reset');
$('#hint').onclick=hint;
$('#rules').onclick=()=>$('#rulesModal').classList.add('open');
$('.close').onclick=()=>$('#rulesModal').classList.remove('open');
$('#completeHome').onclick=goHome;
$('#next').onclick=()=>{const d=g.d;$('#complete').classList.remove('open');clearSharedUrl();start(d,profile.levels[d],randomSeed(),null,false)};
$('#copyLink').onclick=copyLevel;
$('#shareChallenge').onclick=shareChallenge;
$('#board').addEventListener('pointerdown',pointerDown);
$('#board').addEventListener('pointermove',pointerMove);
$('#board').addEventListener('pointerup',pointerUp);
$('#board').addEventListener('pointercancel',pointerCancel);
$('#board').addEventListener('lostpointercapture',pointerCancel);
$('#board').addEventListener('contextmenu',e=>e.preventDefault());

mini();renderIntro();const shared=parseShared();if(shared){selected=shared.d;profile.selected=selected;save();setTimeout(()=>start(shared.d,profile.levels[shared.d],shared.seed,shared.target,true),30)}
window.__stardoku={start,make,countSolutions,validatePuzzle,randomSeed,get game(){return g},solve(){if(!g)return;for(let row=0;row<g.p.n;row++)star(row*g.p.n+g.p.sol[row])},newLevel(d=selected){start(d,profile.levels[d],randomSeed(),null,false)}};
})();
