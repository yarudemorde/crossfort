const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),nodes=new Map(),animations=[];
function node(id,rect={left:0,top:0,width:60,height:90}){
 const n={id,style:{},children:[],removed:false,classList:{add(){},remove(){},toggle(){},contains(){return false;}},getAttribute(){return null;},setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return [];},querySelector(){return null;},getBoundingClientRect(){return rect;},appendChild(c){this.children.push(c);c.parent=this;},remove(){this.removed=true;if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);},cloneNode(){return node('ghost',rect);},animate(frames,options){const a={node:this,frames,options,cancel(){if(this.oncancel)this.oncancel();}};animations.push(a);return a;}};
 return n;
}
function get(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);}
const ctx=vm.createContext({console,Math,setTimeout,clearTimeout,localStorage:{getItem(){return null;},setItem(){}},document:{body:get('body'),documentElement:get('html'),getElementById:get,querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}},window:{addEventListener(){},scrollTo(){}},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){},matchMedia(){return {matches:false};}});
for(const file of ['data/cards.js','data/card-rules.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
vm.runInContext("render=renderStableBattle=logMsg=showPowerGain=animateSummon=animateLandmark=function(){};wait=async function(){};",ctx);
const settled=()=>new Promise(resolve=>setImmediate(resolve));
function card(name){for(const [color,pool]of Object.entries(ctx.CARD_POOLS)){const def=pool.find(c=>c[0]===name);if(def)return ctx.cloneCard(def,color);}throw Error(name);}
let checks=0;function check(condition,label){assert.ok(condition,label);checks++;}
const originalTrigger=ctx.triggerCard;
let events=[];
ctx.triggerCard=async function(c,event,...rest){if(event==='onPlay')events.push(event);return originalTrigger(c,event,...rest);};
const landing=node('landing');ctx.boardCard=()=>landing;ctx.landmarkCard=()=>landing;
function fresh(type='unit',side='player'){
 ctx.cancelPlacementMotion();animations.length=0;events=[];ctx.matchMedia=()=>({matches:false});
 ctx.state={generation:1,gameOver:false,matchMode:'local',playerTurn:side==='player',turn:1,firstSide:'player',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,selectedCard:0,selectedSlot:2,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[]};
 const c=card(type==='landmark'?'危険海域':'農民');
 ctx.handFor(side).push(c);ctx.handView.nodes.set(c,node('source',{left:155,top:620,width:82,height:116}));
 for(const id of ['playerBoard','enemyBoard','playerLandmarks','enemyLandmarks'])get(id).children=Array.from({length:5},()=>node('slot',{left:180,top:350,width:64,height:type==='landmark'?28:96}));
 return c;
}
async function finish(){const a=animations.at(-1);assert.ok(a?.onfinish);a.onfinish();await settled();}
(async()=>{
 const c=fresh(),promise=ctx.playSelectedCard('normal');await settled();
 check(ctx.state.playerBoard[2]===null,'no instant card on board during flight');
 check(ctx.state.animating&&ctx.state.playerHand.length===0,'input locked, one card consumed during flight');
 check(events.length===0,'placement effect waits for movement');
 check(animations.length===1&&animations[0].options.duration===300,'flight has short fixed duration');
 const a=animations[0],frames=a.frames,origin=a.node;
 check(frames[1].transform.includes('px,')&&frames.length===4,'flight uses intermediate arc positions');
 check(get('gameScreen').children.includes(origin),'ghost stays in game styling context');
 await ctx.playSelectedCard('normal');check(ctx.state.mana===8,'repeat press does not spend twice');
 await finish();
 check(ctx.state.playerBoard[2]===c&&events.length===0,'inserted card waits for landing before effect');
 check(animations[1].options.duration===150&&animations[1].frames[1].transform.includes('scale(1.035,.94)'),'landing briefly compresses card');
 await finish();await promise;
 check(origin.removed&&!ctx.state.animating&&events.length===1,'ghost cleaned and effect resolves exactly once');
 fresh('landmark');const lm=ctx.playSelectedCard('normal');await settled();await finish();check(ctx.state.playerLandmarks[2]?.type==='ランドマーク','landmark reaches its separate row');await finish();await lm;
 fresh();const stale=ctx.playSelectedCard('normal').catch(e=>e);await settled();ctx.state.generation++;ctx.cancelPlacementMotion();
 check(await stale===ctx.staleBattle&&ctx.state.playerBoard[2]===null,'cancelled old battle cannot place into new battle');
 check(ctx.placementMotions.size===0,'cancel clears all running animations');
 fresh();ctx.matchMedia=()=>({matches:true});await ctx.playSelectedCard('normal');
 check(animations.length===0&&ctx.state.playerBoard[2],'reduced motion places without animation or lock');
 fresh('unit','enemy');const p2=ctx.playSelectedCard('normal');await settled();
 check(animations.length===1,'player two in local match animates its visible hand');await finish();await finish();await p2;
 fresh();ctx.handView.nodes.clear();await ctx.playSelectedCard('normal').then(()=>{});
 // A missing source still lands safely; fallback timer resolves its short landing.
 check(ctx.state.playerBoard[2]&&ctx.placementMotions.size===0,'missing source falls back without an orphan or lock');
 fresh();const revengeCard=ctx.state.playerHand[0];ctx.chooseOpenSlot=async()=>2;
 const revenge=ctx.useRevengeCard('player',revengeCard);await settled();check(animations.length===1,'revenge from visible hand follows flight');await finish();await finish();await revenge;
 fresh();const zone=ctx.state.playerHand;ctx.chooseZoneCard=async(s,cards)=>cards[0];
 const deployment=ctx.deployFromZone('player',zone,{unitOnly:true});await settled();check(animations.length===1,'effect deployment from hand follows flight');await finish();await finish();await deployment;
 fresh('unit','enemy');ctx.state.matchMode='cpu';const cpu=ctx.state.enemyHand[0];
 const cpuPlay=ctx.executePlayAction({card:cpu,side:'enemy',handIndex:0,lane:2,mode:'normal',cost:2});await settled();
 check(animations.length===1&&animations[0].options.duration===150,'hidden CPU hand uses landing without invented source');await finish();await cpuPlay;
 console.log(checks+' placement regression checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
