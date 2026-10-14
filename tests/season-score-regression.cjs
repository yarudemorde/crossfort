const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
const element={style:{},classList:{add(){},remove(){},contains(){return false;},toggle(){}},getAttribute(){return null;},setAttribute(){},addEventListener(){},querySelectorAll(){return [];},querySelector(){return null;},getBoundingClientRect(){return {top:0,left:0,width:100,height:100};}};
const ctx=vm.createContext({console,Math,setTimeout,clearTimeout,localStorage:{getItem(){return null;},setItem(){}},document:{body:element,documentElement:element,getElementById(){return element;},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}},window:{addEventListener(){},scrollTo(){}},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){}});
for(const file of ['data/cards.js','data/card-rules.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())vm.runInContext(match[1],ctx);
// Keep gameplay and rule processing real; replace visual delays and human input.
vm.runInContext(`
render=renderStableBattle=renderDefenseLine=showDefenseShield=showPowerGain=showDamage=showDestroy=showLandmarkCollapse=animateSummon=animateLandmark=animateCard=pulseClass=showSelectionBanner=logMsg=function(){};
wait=async function(){};
boardCard=function(){return null;};
showSpellCast=async function(){};
chooseZoneCard=async function(side,cards){return cards[0]||null;};
chooseTarget=async function(side,targetSide,prompt,filter){var b=boardFor(targetSide);for(var i=0;i<b.length;i++)if(b[i]&&(!filter||filter(b[i],i)))return {side:targetSide,index:i};return null;};
`,ctx);
function fresh(){
  ctx.state={eventMode:true,battleStats:ctx.newBattleStats(20,true),generation:1,gameOver:false,matchMode:'local',playerTurn:true,turn:1,firstSide:'player',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[],laneStatuses:{player:Array(5).fill(null),enemy:Array(5).fill(null)}};
  return ctx.state;
}
function card(name){for(const [color,pool] of Object.entries(ctx.CARD_POOLS)){const def=pool.find(c=>c[0]===name);if(def)return ctx.cloneCard(def,color);}throw Error(name);}
async function cast(side,c){ctx.handFor(side).push(c);return ctx.executePlayAction({card:c,side,handIndex:ctx.handFor(side).indexOf(c),cost:ctx.effectiveCost(c,side),lane:-1,mode:'normal'});}

let checks=0;function check(label,fn){fn();checks++;console.log('PASS '+label);}
(async()=>{
let s=fresh(),a=card('農民'),t=card('王国の重装歩兵');
const src={sourceType:'combat',sourceSide:'player',sourceCard:a,laneIndex:0};
await ctx.changeLife('enemy',-99,src);
check('intact wall absorbs damage',()=>assert.equal(s.battleStats.unitDamage,0));
await ctx.changeLife('enemy',-99,src);
check('LIFE overkill capped and breach unique',()=>{assert.equal(s.battleStats.unitDamage,20);assert.equal(s.battleStats.breachedLanes.length,1);});
s.enemyLife=20;await ctx.changeLife('enemy',-1,src);
check('breached lane not counted again',()=>assert.equal(s.battleStats.breachedLanes.length,1));
s=fresh();s.enemyBoard[0]=t;t.power=4;await ctx.damage(s.enemyBoard,0,100,'enemy',false,src);
check('unit damage capped at effective power',()=>{assert.equal(s.battleStats.unitDamage,4);assert.equal(s.battleStats.enemyUnitKills,1);});
s.enemyBoard[0]=t;t.power=2;await ctx.destroy('enemy',0);
check('resurrected same instance kill unique',()=>assert.equal(s.battleStats.enemyUnitKills,1));
s.enemyBoard[0]=card('農民');s.enemyBoard[0]=null;
check('bounce/exile is not destruction',()=>assert.equal(s.battleStats.enemyUnitKills,1));
s=fresh();t=card('王国の重装歩兵');t.power=8;s.enemyBoard[0]=t;await ctx.damage(s.enemyBoard,0,1,'enemy',true,src);
check('lethal counts actual effective power removed',()=>assert.equal(s.battleStats.unitDamage,8));
s=fresh();await ctx.changeLife('enemy',-2,{sourceSide:'player',sourceCard:card('禁書の一頁')});await ctx.changeLife('enemy',-3,{sourceSide:'player',sourceCard:a});
check('ability unit source included, spell excluded',()=>assert.equal(s.battleStats.unitDamage,3));
await ctx.changeLife('player',-2);await ctx.changeLife('player',2);
check('healing does not restore perfect victory',()=>assert.equal(ctx.calculateSeasonBattle(s.battleStats,true).parts.perfect,0));
s.battleStats.remainingLife=200;s.battleStats.unitDamage=200;s.battleStats.enemyUnitKills=200;s.battleStats.playerTurns=2;s.battleStats.lifeDamageTaken=0;
check('3900 battle ceiling',()=>assert.equal(ctx.calculateSeasonBattle(s.battleStats,true).total,3900));
check('defeat excludes win speed life perfect survivors',()=>{const p=ctx.calculateSeasonBattle(s.battleStats,false).parts;assert.equal(p.victory+p.speed+p.life+p.perfect,0);});
for(const [turn,expected] of [[2,1000],[4,800],[6,600],[8,400],[10,200],[12,0],[15,0]]){s.battleStats.playerTurns=turn;check('speed '+turn,()=>assert.equal(ctx.calculateSeasonBattle(s.battleStats,true).parts.speed,expected));}
s=fresh();s.enemyBoard[0]=card('王国の重装歩兵');s.enemyBoard[0].power=4;
await ctx.triggerCard(card('沼潜みの射手'),'onPlay','player',0,{});
await ctx.triggerCard(card('帝国の擲弾兵'),'onPlay','player',0,{});
check('real unit abilities attributed through action executor',()=>assert.equal(s.battleStats.unitDamage,2));
await ctx.triggerCard(card('艦砲斉射'),'onPlay','player',0,{});
check('real spell damage excluded from unit total',()=>assert.equal(s.battleStats.unitDamage,2));
s=fresh();s.enemyBoard[0]=card('【闘争の月】ムレブス');await ctx.damage(s.enemyBoard,0,100,'enemy',false,src);
check('combat immunity produces no measured damage',()=>assert.equal(s.battleStats.unitDamage,0));
s=fresh();s.enemyDefense[0]=2;await ctx.changeLife('enemy',-2,src);await ctx.changeLife('enemy',-2,src);
check('multiple attacks and breached bonus counted once per actual hit',()=>assert.equal(s.battleStats.unitDamage,6));
s=fresh();let attacker=card('農民'),defender=card('王国の重装歩兵');attacker.canAttack=true;attacker.power=3;defender.power=2;s.enemyBoard[0]=attacker;s.playerBoard[0]=defender;s.playerTurn=false;
await ctx.executeAttackAction({card:attacker,side:'enemy',lane:0,destination:0});
check('player defensive counterattack attributed correctly',()=>assert.equal(s.battleStats.unitDamage,2));
s=fresh();s.firstSide='enemy';s.playerTurn=false;s.battleStats=ctx.newBattleStats(14,false);ctx.drawCard=async()=>{};ctx.processTurnEvent=async()=>{};ctx.resetTurnAttacks=()=>{};
await ctx.prepareNextTurn('player');await ctx.prepareNextTurn('enemy');s.extraTurns={player:1};await ctx.beginExtraTurn('player');
check('second player and extra turns counted, CPU excluded',()=>assert.equal(s.battleStats.playerTurns,2));
s=fresh();s.enemyLandmarks[0]=card('クロスフォート城');await ctx.destroyLandmark('enemy',0);await ctx.destroyLandmark('enemy',0);
check('landmark actual destruction once',()=>assert.equal(s.battleStats.enemyLandmarkKills,1));
ctx.seasonScores={attempts:1,clears:0,best:null,last:null,history:[],run:{battles:[],complete:false,deck:{name:'test'}}};
for(let stage=1;stage<=3;stage++){s=fresh();Object.assign(s.battleStats,{playerTurns:2,unitDamage:50,enemyUnitKills:20});s.playerLife=20;ctx.recordSeasonBattle(true,stage);ctx.recordSeasonBattle(true,stage);}
ctx.finalizeSeasonScore(true);ctx.finalizeSeasonScore(true);
check('13700 season max and finalization idempotent',()=>{assert.equal(ctx.seasonScores.last.total,13700);assert.equal(ctx.seasonScores.clears,1);assert.equal(ctx.seasonScores.last.rank.rank,'S');});
const best=ctx.seasonScores.best;ctx.seasonScores.run={battles:[],complete:false};s=fresh();ctx.recordSeasonBattle(false,1);ctx.finalizeSeasonScore(false);
check('failed no clear bonus or rank and retains best',()=>{assert.equal(ctx.seasonScores.last.clearBonus,0);assert.equal(ctx.seasonScores.last.rank,null);assert.equal(ctx.seasonScores.best,best);});
ctx.openSeasonStory=()=>{};ctx.renderSeason1Banner=()=>{};ctx.beginSeason1();
check('retry resets run and retains history',()=>{assert.equal(ctx.seasonScores.run.battles.length,0);assert.equal(ctx.seasonScores.best.total,13700);assert.equal(ctx.seasonScores.history.length,2);});
ctx.localStorage.getItem=()=>JSON.stringify({started:true,currentStage:2,currentHp:14,selectedDeckId:'old'});
check('legacy progress loads without scores',()=>{const old=ctx.loadSeason1State();assert.equal(old.currentHp,14);assert.equal(old.currentStage,2);});
for(const [score,rank] of [[11000,'S'],[10999,'A'],[9000,'A'],[8999,'B'],[7000,'B'],[6999,'C'],[4500,'C'],[4499,'D']])check('rank boundary '+score,()=>assert.equal(ctx.SEASON1_RANKS.find(r=>score>=r.min).rank,rank));
console.log(checks+' season score checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
