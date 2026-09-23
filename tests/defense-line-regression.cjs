const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const nodes=new Map();
function node(id){
  if(!nodes.has(id))nodes.set(id,{
    style:{display:'block',setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},
    children:[],innerHTML:'',textContent:'',disabled:false,
    appendChild(child){this.children.push(child)},remove(){},setAttribute(key,value){this[key]=value},getAttribute(key){return this[key]??null},
    querySelector(){return node(id+'-child')},querySelectorAll(){return []}
  });
  return nodes.get(id);
}
const document={getElementById:node,documentElement:node('html'),body:node('body'),querySelector(){return null},querySelectorAll(){return []},createElement(){return node('created-'+Math.random())}};
const ctx=vm.createContext({document,window:{addEventListener(){},scrollTo(){},alert(){}},console,localStorage:{getItem(){return null},setItem(){}},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},TextEncoder,TextDecoder,btoa,atob});
vm.runInContext(fs.readFileSync(path.join(dir,'data/cards.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(dir,'data/card-rules.js'),'utf8'),ctx);
vm.runInContext(script.slice(0,script.lastIndexOf('// Fit names to each existing card width')),ctx);
function run(code){return vm.runInContext(code,ctx)}
function unit(name='クロスフォート兵'){return run(`(function(){var t=cardTemplateByName(${JSON.stringify(name)});return cloneCard(t.row,t.color)})()`)}
function reset(){run("state={generation:++battleGenerationCounter,turn:1,firstSide:'player',playerTurn:true,matchMode:'cpu',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[],battleHistory:[],selectedCard:-1,selectedSlot:-1,gameOver:false,animating:false,targetRequest:null,choiceRequest:null,extraTurns:{player:0,enemy:0}}")}
run('render=function(){};renderPicker=function(){};wait=async function(){};animateCard=function(){};animateSummon=function(){};animateLandmark=function(){};pulseClass=function(){};floatAt=function(){};showDestroy=function(){};showLandmarkCollapse=function(){}');
(async()=>{
  let checks=0;function check(value,description){assert.ok(value,description);checks++}
  reset();check(JSON.stringify(Array.from(ctx.state.playerDefense))==='[0,0,0,0,0]'&&JSON.stringify(Array.from(ctx.state.enemyDefense))==='[0,0,0,0,0]','both sides start with independent intact lines');
  let attacker=unit();ctx.state.playerBoard[0]=attacker;
  for(let hit=1;hit<=3;hit++){
    attacker.canAttack=true;const before=ctx.state.enemyLife;await ctx.attack('player',0);
    check(ctx.state.enemyDefense[0]===Math.min(2,hit),'defense stage after combat '+hit);
    check(before-ctx.state.enemyLife===(hit===3?3:2),'only the third combat hit gains one damage');
  }
  check(ctx.state.battleHistory.some(e=>e.text.includes('ヒビ'))&&ctx.state.battleHistory.some(e=>e.text.includes('突破された'))&&ctx.state.battleHistory.some(e=>e.text.includes('ダメージ+1')),'transition and bonus messages enter battle history');
  const slots=node('enemyDefense');slots.children=[];ctx.renderDefenseLine('enemy','enemyDefense');check(slots.children.length===5&&slots.children[0].innerHTML.includes('defense_wall_breached.png')&&slots.children[1].innerHTML.includes('defense_wall_intact.png'),'five aligned wall images reflect state');
  ctx.state.enemyMana=3;ctx.state.enemyMaxMana=5;ctx.renderResourceSlots('enemy','enemyResourceSlots','enemyResourceTrack');const track=node('enemyResourceSlots').innerHTML;
  check((track.match(/resourceSlot filled/g)||[]).length===3&&(track.match(/resourceSlot spent/g)||[]).length===2&&(track.match(/resourceSlot locked/g)||[]).length===5,'resource track distinguishes three coins, two spent, and five locked slots');
  ctx.state.playerBoard[1]=unit();ctx.state.playerBoard[1].canAttack=true;await ctx.attack('player',1);check(ctx.state.enemyDefense[0]===2&&ctx.state.enemyDefense[1]===1&&ctx.state.enemyLife===11,'different lanes progress independently');
  const beforeSpell=ctx.state.enemyLife;await ctx.changeLife('enemy',-2);check(ctx.state.enemyLife===beforeSpell-2&&ctx.state.enemyDefense[0]===2,'card direct damage neither gains bonus nor advances defense');
  reset();const cpu=unit();cpu.canAttack=true;ctx.state.enemyBoard[2]=cpu;for(let hit=1;hit<=3;hit++){cpu.canAttack=true;const before=ctx.state.playerLife;await ctx.executeAttackAction({side:'enemy',lane:2,destination:2,card:cpu});check(before-ctx.state.playerLife===(hit===3?3:2)&&ctx.state.playerDefense[2]===Math.min(2,hit),'CPU uses the same line rule on hit '+hit)}
  reset();let castle=unit('クロスフォート城');ctx.state.enemyLandmarks[0]=castle;ctx.state.playerBoard[0]=unit();ctx.state.playerBoard[0].canAttack=true;await ctx.attack('player',0);check(ctx.state.enemyDefense[0]===1&&ctx.state.enemyLandmarks[0]===null&&ctx.state.enemyLife===18,'combat still destroys a coexisting landmark without making it a defender');
  reset();ctx.state.enemyBoard[1]=unit();ctx.state.playerBoard[1]=unit();ctx.state.playerBoard[1].canAttack=true;await ctx.attack('player',1);check(ctx.state.enemyDefense[1]===0&&ctx.state.enemyLife===20,'unit defense does not advance a wall');
  reset();ctx.state.playerBoard[1]=unit('帝国の騎馬隊');ctx.state.playerBoard[1].canAttack=true;ctx.state.enemyBoard[1]=unit('群れ呼び蜥蜴');await ctx.attack('player',1);check(ctx.state.enemyDefense[1]===1&&ctx.state.enemyLife<20,'piercing combat damage advances its attack lane');
  reset();ctx.state.maxMana=9;ctx.changeMana('player',5);check(ctx.state.mana===10,'resource gain respects ten-slot upper bound');await ctx.triggerCard(unit('永遠樹の恩寵'),'onPlay','player',-1,{});check(ctx.state.maxMana===10,'maximum resource effect caps at ten');
  ctx.startGame('緑','赤','cpu','','','player');await Promise.resolve();check(Array.from(ctx.state.playerDefense).every(x=>x===0)&&Array.from(ctx.state.enemyDefense).every(x=>x===0),'new match resets both walls');
  ctx.state.enemyDefense[4]=2;ctx.state.playerDefense[2]=1;ctx.startGame('緑','赤','cpu','','','player',{eventMode:true,eventStage:1});await Promise.resolve();check(Array.from(ctx.state.playerDefense).every(x=>x===0)&&Array.from(ctx.state.enemyDefense).every(x=>x===0),'event battle and rematch reset walls');
  ctx.state.playerDefense[3]=2;ctx.startGame('緑','赤','local','','','player');await Promise.resolve();check(Array.from(ctx.state.playerDefense).every(x=>x===0)&&Array.from(ctx.state.enemyDefense).every(x=>x===0),'local match also resets all lanes');
  const order=['enemyDefense','enemyLandmarks','enemyBoard','battleLog','playerBoard','playerLandmarks','playerDefense','playerLife','playerHand'].map(x=>html.indexOf('id="'+x+'"'));
  check(order.every((position,i)=>position>=0&&(!i||position>order[i-1])),'battle DOM keeps requested top-to-bottom order');
  check(['resource_bar_10slots.png','resource_coin_gold.png','resource_empty_slot.png','life_heart.png','defense_wall_intact.png','defense_wall_cracked.png','defense_wall_breached.png'].every(name=>fs.existsSync(path.join(dir,'assets/ui/battle',name))),'all seven supplied images are integrated');
  console.log(`${checks} defense-line regression assertions passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
