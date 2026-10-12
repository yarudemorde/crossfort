const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
const element={style:{},classList:{add(){},remove(){},contains(){return false;},toggle(){}},getAttribute(){return null;},setAttribute(){},addEventListener(){},querySelectorAll(){return [];},querySelector(){return null;},getBoundingClientRect(){return {top:0,left:0,width:100,height:100};}};
const ctx=vm.createContext({console,Math,setTimeout,clearTimeout,localStorage:{getItem(){return null;},setItem(){}},document:{body:element,documentElement:element,getElementById(){return element;},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}},window:{addEventListener(){},scrollTo(){}},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){}});
for(const file of ['data/cards.js','data/card-rules.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())vm.runInContext(match[1],ctx);
// Keep gameplay and rule processing real; replace visual delays and human input.
vm.runInContext(`
render=renderStableBattle=renderDefenseLine=showDefenseShield=showPowerGain=showDamage=showDestroy=animateSummon=animateLandmark=animateCard=pulseClass=showSelectionBanner=logMsg=function(){};
wait=async function(){};
boardCard=function(){return null;};
showSpellCast=async function(){};
chooseZoneCard=async function(side,cards){return cards[0]||null;};
chooseTarget=async function(side,targetSide,prompt,filter){var b=boardFor(targetSide);for(var i=0;i<b.length;i++)if(b[i]&&(!filter||filter(b[i],i)))return {side:targetSide,index:i};return null;};
`,ctx);
function fresh(){
  ctx.state={generation:1,gameOver:false,matchMode:'local',playerTurn:true,turn:1,firstSide:'player',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[],laneStatuses:{player:Array(5).fill(null),enemy:Array(5).fill(null)}};
  return ctx.state;
}
function card(name){for(const [color,pool] of Object.entries(ctx.CARD_POOLS)){const def=pool.find(c=>c[0]===name);if(def)return ctx.cloneCard(def,color);}throw Error(name);}
async function cast(side,c){ctx.handFor(side).push(c);return ctx.executePlayAction({card:c,side,handIndex:ctx.handFor(side).indexOf(c),cost:ctx.effectiveCost(c,side),lane:-1,mode:'normal'});}
let checks=0;function check(label,fn){fn();checks++;console.log('PASS '+label);}
(async()=>{
  const ids=Object.values(ctx.CARD_IDS);
  check('IDs unique',()=>assert.equal(new Set(ids).size,ids.length));
  check('9 cards registered',()=>assert.equal(ids.filter(id=>/^C003-0(1[7-9]|2[0-4])$/.test(id)||id==='C002-044').length,9));
  let s=fresh(),research=card('世界書庫の研究者'),admiral=card('万旗の提督オストロイ'),salvo=card('艦砲斉射'),route=card('航路の開拓');
  s.playerBoard[0]=research;s.playerBoard[1]=admiral;s.playerHand=[salvo,route];s.playerDeck=[card('農民'),card('農民'),card('農民'),card('農民'),card('農民')];
  await cast('player',card('禁書の一頁'));
  check('first spell draws both normal and admiral cards',()=>assert.equal(s.playerHand.length,4));
  check('spell listeners grow only cards already in hand',()=>{assert.equal(research.power,2);assert.equal(salvo.spellDamageBonus,1);assert.equal(ctx.effectiveCost(route,'player'),5);});
  await cast('player',card('禁書の一頁'));
  check('second spell buffs admiral',()=>assert.equal(admiral.power,5));
  const target=card('王国の重装歩兵');target.power=4;s.enemyBoard[0]=target;s.enemyLandmarks[0]=card('クロスフォート城');
  await cast('player',salvo);
  check('third spell triggers AOE, boosted salvo and LIFE damage',()=>{assert.equal(s.enemyBoard[0],null);assert.equal(s.enemyLife,19);assert.ok(s.enemyLandmarks[0]);});
  check('casting card does not boost itself and loses hand bonus in grave',()=>{assert.equal(salvo.spellDamageBonus,undefined);assert.equal(ctx.effectiveCost(route,'player'),3);});
  await ctx.processTurnEvent('enemy','onTurnStart');
  check('spell ordinal resets every turn',()=>assert.equal(s.spellsThisTurn.player,0));
  // Grave spell retrieval filters units and removes exactly the selected spell.
  s=fresh();const library=card('フィエンデン世界書庫'),unit=card('農民'),page=card('禁書の一頁');
  s.playerLandmarks[2]=library;s.grave=[unit,page];
  await ctx.processTurnEvent('player','onTurnStart');
  check('landmark recovers only spells',()=>{assert.equal(s.playerHand[0],page);assert.deepEqual(s.grave,[unit]);});
  // Top-three selection preserves the untouched top, with remainders at bottom.
  s=fresh();const night=card('港湾都市の夜警'),a=card('農民'),b=card('禁書の一頁'),c=card('農民'),d=card('王国の重装歩兵');
  s.playerBoard[0]=night;s.playerDeck=[a,b,c,d];
  await ctx.triggerCard(night,'onPlay','player',0,{});
  check('top-three spell selection and bottom order',()=>{assert.equal(s.playerHand[0],b);assert.deepEqual(s.playerDeck,[d,a,c]);});
  s=fresh();const ally=card('農民'),fourth=card('禁書【第四章】'),g1=card('禁書の一頁'),g2=card('航路の開拓'),gu=card('農民');
  s.playerBoard[0]=ally;s.grave=[g1,gu,g2];
  await cast('player',fourth);
  check('fourth chapter counts grave spells, shuffles only spells, excludes itself',()=>{assert.equal(ally.power,ally.basePower+2);assert.deepEqual(s.grave,[gu,fourth]);assert.equal(s.playerDeck.length,2);assert.ok(s.playerDeck.includes(g1)&&s.playerDeck.includes(g2));});
  s=fresh();const hunter=card('【狩猟の月】オイタネヴ'),enemyHunter=card('【狩猟の月】オイタネヴ');s.playerHand=[hunter];s.enemyHand=[enemyHunter];
  await ctx.emitFriendlyAction('player','onFriendlyAttack',{attacker:card('農民')});
  check('hunter grows only in its owner hand',()=>{assert.equal(hunter.power,2);assert.equal(enemyHunter.power,1);});
  s.playerHand=[];s.playerBoard[0]=hunter;ctx.initializePlacedAttacks(hunter,'player');
  await ctx.emitFriendlyAction('player','onFriendlyAttack',{attacker:hunter});
  check('hunter has haste but stops growing on board',()=>{assert.ok(ctx.remainingAttacks(hunter));assert.equal(hunter.power,2);assert.ok(ctx.placementRestriction('player',card('【狩猟の月】オイタネヴ')));});
  s=fresh();s.matchMode='cpu';const enemyResearch=card('世界書庫の研究者');s.enemyBoard[0]=enemyResearch;s.enemyDeck=[card('農民')];
  await cast('enemy',card('禁書の一頁'));
  check('CPU spell uses shared listener path',()=>assert.equal(enemyResearch.power,2));
  s=fresh();const revengeResearch=card('世界書庫の研究者'),rev=card('異端審問');s.playerBoard[0]=revengeResearch;s.playerHand=[rev];
  await ctx.useRevengeCard('player',rev);
  check('revenge spell uses shared listener path',()=>assert.equal(revengeResearch.power,2));
  s=fresh();const humanResearch=card('世界書庫の研究者');s.playerBoard[0]=humanResearch;s.playerHand=[card('禁書の一頁')];s.playerDeck=[card('農民')];s.selectedCard=0;s.selectedSlot=-1;
  await ctx.playSelectedCard('normal');
  check('human spell uses shared listener path',()=>assert.equal(humanResearch.power,2));
  s=fresh();const wall=card('農民'),attackHunter=card('【狩猟の月】オイタネヴ');wall.canAttack=true;s.playerBoard[0]=wall;s.playerHand=[attackHunter];
  await ctx.attack('player',0);
  check('human attack emits hand listener once',()=>assert.equal(attackHunter.power,2));
  s=fresh();const cpuWall=card('農民'),cpuHunter=card('【狩猟の月】オイタネヴ');cpuWall.canAttack=true;s.enemyBoard[0]=cpuWall;s.enemyHand=[cpuHunter];
  await ctx.executeAttackAction({card:cpuWall,side:'enemy',lane:0,destination:0});
  check('CPU attack emits hand listener once',()=>assert.equal(cpuHunter.power,2));
  console.log(checks+' checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
