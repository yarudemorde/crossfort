const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css=fs.readFileSync(path.join(dir,'parchment.css'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const nodes=new Map();
function node(id){
  if(!nodes.has(id))nodes.set(id,{style:{display:'block',setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},children:[],innerHTML:'',textContent:'',disabled:false,appendChild(child){this.children.push(child)},remove(){},setAttribute(){},getAttribute(){return null},querySelector(){return node(id+'-card')},querySelectorAll(){return []}});
  return nodes.get(id);
}
const document={getElementById:node,documentElement:node('html'),body:node('body'),querySelector(){return null},querySelectorAll(){return []},createElement(){return node('created-'+Math.random())}};
const ctx=vm.createContext({document,window:{addEventListener(){},scrollTo(){},alert(){}},console,localStorage:{getItem(){return null},setItem(){}},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},TextEncoder,TextDecoder,btoa,atob});
vm.runInContext(fs.readFileSync(path.join(dir,'data/cards.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(dir,'data/card-rules.js'),'utf8'),ctx);
vm.runInContext(script.slice(0,script.lastIndexOf('// Fit names to each existing card width')),ctx);
function run(code){return vm.runInContext(code,ctx)}
function card(name){return run(`(function(){var t=cardTemplateByName(${JSON.stringify(name)});return cloneCard(t.row,t.color)})()`)}
function reset(){run("state={generation:++battleGenerationCounter,turn:1,firstSide:'player',playerTurn:true,matchMode:'cpu',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[],battleHistory:[],selectedCard:-1,selectedSlot:-1,gameOver:false,animating:false,targetRequest:null,choiceRequest:null,extraTurns:{player:0,enemy:0}}")}
run("render=function(){};renderPicker=function(){};wait=async function(){};animateCard=function(){};animateSummon=function(){};animateLandmark=function(){};pulseClass=function(){};floatAt=function(){};showDestroy=function(){};showLandmarkCollapse=function(){};keywordFxCalls=[];animateKeywordEffect=function(side,index,keyword){keywordFxCalls.push([side,index,keyword])}");
(async()=>{
  let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++};
  reset();
  const guard=card('クロスフォート兵'),lethal=card('毒牙の蜥蜴'),haste=card('帝国の突撃兵'),pierce=card('帝国の騎馬隊'),dive=card('人食いクラゲ');
  check(ctx.battlefieldKeywordEffects(guard,'player').includes('keywordAuraGuard')&&!ctx.keywordBadges(guard,'player').includes('guard'),'guard uses a battlefield shield layer instead of its old icon');
  check(ctx.battlefieldKeywordEffects(lethal,'player').includes('keywordAuraLethal')&&!ctx.keywordBadges(lethal,'player').includes('lethal'),'lethal uses a battlefield aura layer instead of its old icon');
  check(ctx.battlefieldKeywordEffects(haste,'player').includes('keywordMomentHaste')&&!ctx.keywordBadges(haste,'player').includes('haste'),'haste has only a moment layer and no battlefield icon');
  check(ctx.battlefieldKeywordEffects(pierce,'player').includes('keywordMomentPierce')&&!ctx.keywordBadges(pierce,'player').includes('pierce'),'pierce has only a moment layer and no battlefield icon');
  check(ctx.battlefieldKeywordEffects(dive,'player').includes('keywordMomentDive'),'dive-capable cards receive a dormant battlefield-only moment layer');
  ctx.CARD_RULES['複合キーワード検証']={keywords:['guard','lethal','haste','pierce']};
  const combo={name:'複合キーワード検証',cost:1,power:2,type:'ユニット',text:'魂響',color:'黒',canAttack:true};
  const comboFx=ctx.battlefieldKeywordEffects(combo,'player');
  check(['keywordAuraGuard','keywordAuraLethal','keywordMomentHaste','keywordMomentPierce'].every(name=>comboFx.includes(name))&&!comboFx.includes('Soul'),'multiple keywords coexist while soul echo adds no visual layer');
  check(ctx.battlefieldKeywordEffects({name:'通常ユニット',type:'ユニット',power:1,text:'',color:'白'},'player')==='','cards without visual keywords add no empty effect DOM');
  check((html.match(/battlefieldKeywordEffects\(/g)||[]).length===2,'battlefield effects are created only by their helper and renderBoard');
  const handSource=html.slice(html.indexOf('function renderHand'),html.indexOf("window.addEventListener('resize'"));
  const catalogSource=html.slice(html.indexOf('function renderCatalog'),html.indexOf('function showComingSoon'));
  const detailSource=html.slice(html.indexOf('function showCardDetail'),html.indexOf('function hideCardDetail'));
  check(!handSource.includes('battlefieldKeywordEffects')&&!catalogSource.includes('battlefieldKeywordEffects')&&!detailSource.includes('battlefieldKeywordEffects'),'hand, catalog, and enlarged detail rendering never add battlefield effects');
  run('keywordFxCalls=[]');haste.canAttack=true;ctx.animatePlacement('player',0,haste,'normal');check(ctx.keywordFxCalls.some(call=>call[2]==='Haste'),'haste flashes when a haste unit enters ready to attack');
  run('keywordFxCalls=[]');haste.canAttack=false;ctx.animatePlacement('player',0,haste,'normal');check(ctx.keywordFxCalls.length===0,'haste does not flash for a placement that is not immediately attackable');
  run('keywordFxCalls=[]');ctx.animatePlacement('player',0,dive,'dive');check(ctx.keywordFxCalls.some(call=>call[2]==='Dive'),'dive flashes only when the dive placement mode is used');
  run('keywordFxCalls=[]');ctx.animatePlacement('player',0,dive,'normal');check(ctx.keywordFxCalls.length===0,'normal placement of a dive-capable card has no dive flash');
  reset();run('keywordFxCalls=[]');ctx.state.playerBoard[2]=card('農民');ctx.state.playerBoard[2].canAttack=true;ctx.state.enemyBoard[1]=guard;await ctx.attack('player',2);check(ctx.keywordFxCalls.some(call=>call[0]==='enemy'&&call[1]===1&&call[2]==='Guard'),'guard reaction flashes when guard actually defends an adjacent lane');
  reset();run('keywordFxCalls=[]');ctx.state.playerBoard[0]=lethal;lethal.canAttack=true;ctx.state.playerBoard[0].canAttack=true;ctx.state.enemyBoard[0]=card('農民');await ctx.attack('player',0);check(ctx.keywordFxCalls.some(call=>call[2]==='Lethal'),'lethal reaction flashes when lethal combat damage is dealt');
  reset();run('keywordFxCalls=[]');pierce.power=4;pierce.canAttack=true;ctx.state.playerBoard[0]=pierce;ctx.state.enemyBoard[0]=card('農民');await ctx.attack('player',0);check(ctx.keywordFxCalls.some(call=>call[2]==='Pierce'),'pierce impact flashes only when positive overflow combat damage occurs');
  check(css.includes('.battlefieldKeywordFx{z-index:1;contain:paint}')&&css.includes('.keywordAuraGuard')&&css.includes('.keywordAuraLethal')&&css.includes('@keyframes keywordDiveArrival'),'all effects are lightweight CSS layers contained by the existing overflow-hidden card');
  check(/\.card\{[^}]*overflow:hidden/.test(html)&&!css.includes('animation:keywordAura'),'static guard and lethal auras stay inside the responsive card without looping animation');
  check(html.includes('parchment.css?v=12'),'battle clients receive the updated effect stylesheet without stale cache reuse');
  console.log(`${checks} keyword-effect regression assertions passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
