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
  if(!nodes.has(id))nodes.set(id,{style:{display:'block',setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false}},children:[],innerHTML:'',textContent:'',disabled:false,appendChild(child){this.children.push(child)},remove(){},setAttribute(key,value){this[key]=value},getAttribute(key){return this[key]??null},querySelector(){return node(id+'-child')},querySelectorAll(){return []}});
  return nodes.get(id);
}
const document={getElementById:node,documentElement:node('html'),body:node('body'),querySelector(){return null},querySelectorAll(){return []},createElement(){return node('created-'+Math.random())}};
const ctx=vm.createContext({document,window:{addEventListener(){},scrollTo(){},alert(){}},console,localStorage:{getItem(){return null},setItem(){}},setTimeout(){return 1},clearTimeout(){},requestAnimationFrame(){},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},TextEncoder,TextDecoder,btoa,atob,Math});
vm.runInContext(fs.readFileSync(path.join(dir,'data/cards.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(dir,'data/card-rules.js'),'utf8'),ctx);
vm.runInContext(script.slice(0,script.lastIndexOf('// Fit names to each existing card width')),ctx);
function run(code){return vm.runInContext(code,ctx)}
function card(name){return run(`(function(){var t=cardTemplateByName(${JSON.stringify(name)});return cloneCard(t.row,t.color)})()`)}
function reset(){run("state={generation:++battleGenerationCounter,turn:5,firstSide:'player',playerTurn:false,matchMode:'cpu',playerColor:'黄',enemyColor:'赤',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[],battleHistory:[],selectedCard:-1,selectedSlot:-1,gameOver:false,animating:false,targetRequest:null,choiceRequest:null,extraTurns:{player:0,enemy:0},aiStallTurns:0}")}
run('render=function(){};renderPicker=function(){};wait=async function(){};animateCard=function(){};animateSummon=function(){};animateLandmark=function(){};pulseClass=function(){};floatAt=function(){};showDestroy=function(){};showLandmarkCollapse=function(){};showDefenseShield=function(){}');

let checks=0;function check(value,description){assert.ok(value,description);checks++}

reset();
const mover=card('真紅の囁きアリオサ');mover.power=3;mover.canAttack=true;ctx.state.enemyBoard[1]=mover;ctx.state.playerDefense=[0,1,2,0,0];
const intact=ctx.evaluateAttackAction(mover,1,'enemy',0),cracked=ctx.evaluateAttackAction(mover,1,'enemy',1),breached=ctx.evaluateAttackAction(mover,1,'enemy',2);
check(breached.score>cracked.score&&cracked.score>intact.score&&intact.score>0,'attack scoring prefers breached, then cracked, while intact remains valuable');
check(ctx.chooseBestAttack('enemy').destination===2,'CPU chooses the breached destination when other conditions match');

reset();
const lethalAttacker=card('クロスフォート兵');lethalAttacker.power=3;lethalAttacker.canAttack=true;ctx.state.enemyBoard[0]=lethalAttacker;ctx.state.playerDefense[0]=2;ctx.state.playerLife=4;
check(ctx.evaluateAttackAction(lethalAttacker,0,'enemy',0).lethal,'three power finds four-damage lethal through a breached wall');

reset();
const doubled=card('クロスフォート兵');doubled.power=3;doubled.canAttack=true;const bozaya=card('反乱の先導者ボザヤ');bozaya.canAttack=false;ctx.state.enemyBoard[0]=doubled;ctx.state.enemyBoard[4]=bozaya;ctx.state.playerDefense[0]=2;ctx.state.playerLife=7;
check(ctx.cpuDirectDamagePotential('enemy')===7&&ctx.evaluateAttackAction(doubled,0,'enemy',0).lethal,'Bozaya multiplier is applied before the fixed breached-wall bonus');

reset();
const guard=card('クロスフォート兵');const threat=card('帝国の騎馬隊');threat.power=4;ctx.state.playerBoard[2]=threat;ctx.state.enemyDefense[2]=2;ctx.state.enemyLife=5;
check(ctx.evaluateLaneForCard(guard,1,'enemy')>ctx.evaluateLaneForCard(guard,4,'enemy')+1000,'guard placement strongly prioritizes preventing breached-lane lethal');

reset();
const landmark=card('クロスフォート城');const landmarkThreat=card('クロスフォート兵');landmarkThreat.power=4;ctx.state.playerBoard[0]=landmarkThreat;ctx.state.enemyDefense=[2,0,0,0,0];
check(ctx.evaluateLaneForCard(landmark,4,'enemy')>ctx.evaluateLaneForCard(landmark,0,'enemy'),'valuable landmark avoids an exposed breached lane');

reset();
const haste=card('帝国の突撃兵');ctx.state.playerDefense=[0,0,2,0,0];
check(ctx.evaluateLaneForCard(haste,2,'enemy')>ctx.evaluateLaneForCard(haste,0,'enemy'),'haste placement includes immediate defense-line pressure');

reset();
const piercer=card('帝国の騎馬隊');piercer.power=4;piercer.canAttack=true;const smallGuard=card('クロスフォート兵');smallGuard.power=1;ctx.state.enemyBoard[0]=piercer;ctx.state.playerBoard[0]=smallGuard;
const intactPierce=ctx.evaluateAttackAction(piercer,0,'enemy',0);
check(ctx.cpuDirectDamagePotential('enemy')===0&&intactPierce.score>0&&!intactPierce.lethal,'pierce values cracking an intact wall without treating overflow as life damage');

reset();
const commander=card('強襲の指揮官');ctx.state.enemyHand=[commander,card('帝国の擲弾兵'),card('帝国の騎馬隊')];
const commanderWithFollowUps=ctx.getPlayableActions('enemy').find(action=>action.card===commander&&action.lane===0).score;
const commanderChosenFirst=ctx.chooseBestPlayAction('enemy').card===commander;
reset();const commanderAlone=card('強襲の指揮官');ctx.state.enemyHand=[commanderAlone];
const commanderBase=ctx.getPlayableActions('enemy').find(action=>action.card===commanderAlone&&action.lane===0).score;
check(commanderChosenFirst&&commanderWithFollowUps>commanderBase+ctx.AI_WEIGHTS.comboOrder,'Assault Commander is ordered before later unit deployments');

reset();
const shaturtska=card('鱗の頭領シャトゥルツカ');ctx.state.enemyHand=[shaturtska,card('群れ呼び蜥蜴'),card('沼潜みの射手')];
const leaderCombo=ctx.getPlayableActions('enemy').find(action=>action.card===shaturtska&&action.lane===0).score;
const leaderChosenFirst=ctx.chooseBestPlayAction('enemy').card===shaturtska;
reset();const leaderSolo=card('鱗の頭領シャトゥルツカ');ctx.state.enemyHand=[leaderSolo];
const leaderBase=ctx.getPlayableActions('enemy').find(action=>action.card===leaderSolo&&action.lane===0).score;
check(leaderChosenFirst&&leaderCombo>leaderBase+ctx.AI_WEIGHTS.comboOrder,'Shaturtska is ordered before multiple Riskari follow-ups');

reset();
const vanbietta=card('龍皇帝ヴァンビエッタⅢ'),dragon=card('起源の龍モルディヤルデ');ctx.state.enemyHand=[vanbietta,dragon];ctx.state.enemyMana=6;
const vanbiettaCombo=ctx.getPlayableActions('enemy').find(action=>action.card===vanbietta&&action.lane===0).score;
reset();const vanbiettaSolo=card('龍皇帝ヴァンビエッタⅢ');ctx.state.enemyHand=[vanbiettaSolo];ctx.state.enemyMana=6;
const vanbiettaBase=ctx.getPlayableActions('enemy').find(action=>action.card===vanbiettaSolo&&action.lane===0).score;
check(vanbiettaCombo>vanbiettaBase+10,'Vanbietta values a free high-value dragon deployment');

reset();
for(let i=0;i<4;i++)ctx.state.enemyBoard[i]=card('クロスフォート兵');const mordiyalde=card('起源の龍モルディヤルデ');ctx.state.enemyHand=[mordiyalde];ctx.state.enemyMana=0;
const freeDragon=ctx.getPlayableActions('enemy').find(action=>action.card===mordiyalde);
check(freeDragon&&freeDragon.cost===0,'Mordiyalde enters candidates at zero cost only when four units are present');

reset();
const setupUnit=card('帝国の擲弾兵');ctx.state.enemyBoard[0]=card('クロスフォート兵');ctx.state.enemyBoard[1]=card('クロスフォート兵');ctx.state.enemyBoard[2]=card('クロスフォート兵');ctx.state.enemyHand=[setupUnit,card('起源の龍モルディヤルデ')];
const setupScore=ctx.getPlayableActions('enemy').find(action=>action.card===setupUnit&&action.lane===3).score;
ctx.state.enemyHand=[setupUnit];const ordinaryScore=ctx.getPlayableActions('enemy').find(action=>action.card===setupUnit&&action.lane===3).score;
check(setupScore>ordinaryScore+ctx.AI_WEIGHTS.comboOrder,'third-to-fourth unit setup recognizes the following zero-cost Mordiyalde play');

reset();
const kord=card('港印卿コルドロッホ');ctx.state.enemyHand=[kord];const kordEmpty=ctx.getPlayableActions('enemy').find(action=>action.card===kord&&action.lane===0).score;ctx.state.enemyGrave=[card('白龍エルレハイヌ')];const kordLoaded=ctx.getPlayableActions('enemy').find(action=>action.card===kord&&action.lane===0).score;
check(kordLoaded>kordEmpty+3,'Kordorokh values the best public own-grave resurrection target');

reset();
const revival=card('黄金文明の再興');ctx.state.enemyHand=[revival];const revivalEmpty=ctx.getPlayableActions('enemy').find(action=>action.card===revival).score;ctx.state.enemyLandmarks[0]=card('黄金色の聖杯');ctx.state.enemyLandmarks[1]=card('砂漠に沈む黄金門');const revivalReady=ctx.getPlayableActions('enemy').find(action=>action.card===revival).score;
check(revivalReady>revivalEmpty+8,'Golden Civilization Revival scales with relic count and open unit slots');

reset();
const wipe=card('終末の亀裂 ダルディエク');ctx.state.enemyHand=[wipe];ctx.state.enemyLife=4;const incoming=card('クロスフォート兵');incoming.power=4;ctx.state.playerBoard[0]=incoming;ctx.state.enemyDefense[0]=2;
check(ctx.getPlayableActions('enemy').find(action=>action.card===wipe).score>ctx.AI_WEIGHTS.preventLethal,'board wipe receives prevent-lethal priority against a breached-lane threat');

reset();
ctx.state.enemyMana=1;ctx.state.enemyHand=[card('白龍エルレハイヌ')];
check(ctx.getPlayableActions('enemy').length===0,'CPU never creates unaffordable normal play candidates');

const aiSource=script.slice(script.indexOf('var AI_DEBUG=false;'),script.indexOf('function checkGame()'));
check(!/state\.playerHand\s*\[|state\.playerDeck\s*\[/.test(aiSource),'AI scoring does not inspect opponent hand contents or deck order');

console.log(`${checks} CPU AI regression assertions passed`);
