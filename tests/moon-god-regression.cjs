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
const H='【生と死の月】へヴィスロム',M='【闘争の月】ムイダス',A='【豊穣の月】アベルティマ';
(async()=>{
  let checks=0;function check(value,label){assert.ok(value,label);checks++}
  for(const [i,name] of [H,M,A].entries()){
    const c=unit(name);check(c.id==='C002-0'+(41+i)&&c.species==='月神'&&c.color==='黒'&&!c.legendary,'exact moon god metadata '+name);
    check(c.cost===[5,7,6][i]&&c.power===[3,5,4][i]&&ctx.cardTypeLine(c).includes('月神'),'printed values and UI species '+name);
  }
  reset();check(ctx.canPlaceCard('player',unit(H),0),'1 no moon god permits placement');
  ctx.state.playerBoard[0]=unit(M);
  check(!ctx.canPlaceCard('player',unit(H),1),'2 another moon god blocked');
  check(!ctx.canPlaceCard('player',unit(M),1),'3 same moon god blocked');
  await ctx.destroy('player',0);check(ctx.canPlaceCard('player',unit(A),0),'4 destroyed moon god releases restriction');
  ctx.state.enemyBoard[0]=unit(M);check(ctx.canPlaceCard('player',unit(H),0),'5 enemy moon god irrelevant');
  ctx.state.playerHand=[unit(A)];ctx.state.playerDeck=[unit(M)];ctx.state.grave=[unit(H)];
  check(ctx.canPlaceCard('player',unit(H),0),'off-board moon gods irrelevant');
  // Verify entry points reject before spending, removing from a zone, or prompting.
  reset();ctx.state.playerBoard[0]=unit(A);ctx.state.playerHand=[unit(H)];ctx.state.selectedCard=0;ctx.state.selectedSlot=1;
  await ctx.playSelectedCard();check(ctx.state.playerHand.length===1&&ctx.state.mana===10&&!ctx.state.playerBoard[1],'human placement restriction is transactional');
  ctx.selectCard(0);check(ctx.state.battleHistory.some(e=>e.text.includes('月神が存在するため配置できません')),'hand selection explains restriction');
  reset();ctx.state.enemyBoard[0]=unit(A);let blocked=unit(H);ctx.state.enemyHand=[blocked];ctx.state.enemyGrave=[unit(M)];
  check(!ctx.aiCanUseCard(blocked,'enemy',1,'normal')&&ctx.getPlayableActions('enemy').every(a=>a.card!==blocked),'CPU candidate restriction');
  check(!await ctx.executePlayAction({side:'enemy',card:blocked,handIndex:0,cost:5,lane:1,mode:'normal'})&&ctx.state.enemyMana===10,'CPU execution restriction');
  check(await ctx.deployFromZone('enemy',ctx.state.enemyGrave,{})===null&&ctx.state.enemyGrave.length===1,'grave deployment restriction');
  check(await ctx.deployFromZone('enemy',ctx.state.enemyHand,{})===null&&ctx.state.enemyHand.length===1,'hand effect deployment restriction');
  await ctx.triggerCard(blocked,'onDiscover','enemy',-1,{});
  // Observe actual grave state and all ordinary destruction hooks before redeployment.
  reset();let hevi=unit(H),dragon=unit('白龍エルレハイヌ'),friend=unit('復讐者アーシュ'),enemy=unit('真紅の囁きアリオサ');
  ctx.state.enemyBoard[0]=hevi;ctx.state.enemyBoard[1]=dragon;ctx.state.enemyBoard[4]=friend;ctx.state.playerBoard[4]=enemy;
  ctx.state.enemyDeck=[unit(),unit(),unit(),unit()];
  ctx.observed=[];run("savedTrigger=triggerCard;triggerCard=async function(c,event,side,lane,context){if(context&&context.destroyed)observed.push({event:event,inGrave:graveFor(side==='player'&&event==='onEnemyDestroyed'?'enemy':side).includes(context.destroyed),onBoard:boardFor('enemy').includes(context.destroyed)});return savedTrigger(c,event,side,lane,context)}");
  await ctx.triggerCard(hevi,'onPlay','enemy',0,{});
  check(ctx.observed.some(e=>e.event==='onDestroyed'&&!e.onBoard),'6 target really destroyed');
  check(friend.power===friend.basePower+1&&ctx.observed.some(e=>e.event==='onFriendlyDestroyed')&&ctx.observed.some(e=>e.event==='onEnemyDestroyed'),'7 ordinary destruction hooks fire');
  check(ctx.observed.some(e=>e.inGrave&&e.event==='onDestroyed'),'8 card enters grave before destruction hooks');
  check(ctx.state.enemyBoard.includes(dragon)&&!ctx.state.enemyGrave.includes(dragon),'9 exact destroyed instance redeployed from grave');
  check(!ctx.state.enemyBoard[1],'10 original lane excluded');
  check(ctx.state.enemyHand.length===3,'11 white dragon onPlay draws three again');
  run('triggerCard=savedTrigger');
  reset();hevi=unit(H);ctx.state.enemyHand=[hevi];await ctx.executePlayAction({side:'enemy',card:hevi,handIndex:0,cost:5,lane:0,mode:'normal'});
  check(ctx.state.enemyBoard[0]===hevi,'12 no target still permits moon god placement');
  for(let i=1;i<5;i++)ctx.state.enemyBoard[i]=unit();
  check(!ctx.redeployTargetValid('enemy',hevi,ctx.state.enemyBoard[1],1),'13 full board cannot select unredeployable target');
  let otherMoon=unit(M);ctx.state.enemyBoard[1]=otherMoon;ctx.state.enemyBoard[2]=null;
  check(!ctx.redeployTargetValid('enemy',hevi,otherMoon,1),'14 moon gods cannot be redeployed beside Hevisrom');
  // Combat damage versus effect damage, plus both human and CPU combat entry points.
  reset();let muid=unit(M);ctx.state.playerBoard[0]=muid;
  await ctx.damage(ctx.state.playerBoard,0,100,'player',true,{sourceType:'combat'});check(muid.power===5&&ctx.state.playerBoard[0]===muid,'15 combat damage immune, lethal cannot bypass zero damage');
  await ctx.damage(ctx.state.playerBoard,0,1,'player',false,{sourceType:'spell'});check(muid.power===4,'16 spell damage applies');
  await ctx.triggerCard(unit('沼潜みの射手'),'onPlay','enemy',0,{});check(muid.power===3,'17 placement damage applies');
  await ctx.destroy('player',0);check(!ctx.state.playerBoard[0]&&ctx.state.grave.includes(muid),'18 destruction effect applies');
  reset();muid=unit(M);ctx.state.playerBoard[0]=muid;await ctx.triggerCard(unit('港印卿の拒絶'),'onPlay','enemy',-1,{});
  check(!ctx.state.playerBoard[0]&&ctx.state.playerDeck.at(-1)===muid,'19 bottom-deck effect applies');
  reset();muid=unit(M);ctx.state.playerBoard[0]=muid;let killer=unit('毒牙の蜥蜴');ctx.state.enemyBoard[0]=killer;killer.canAttack=true;
  await ctx.executeAttackAction({side:'enemy',lane:0,destination:0,card:killer});check(ctx.state.playerBoard[0]===muid&&muid.power===5,'20 defending MuIdas survives lethal combat');
  reset();muid=unit(M);ctx.state.playerBoard[0]=muid;muid.canAttack=true;ctx.state.enemyBoard[0]=unit('毒牙の蜥蜴');await ctx.attack('player',0);
  check(ctx.state.playerBoard[0]===muid&&muid.power===5&&muid.canAttack,'attacking MuIdas survives lethal counterattack');
  reset();muid=unit(M);ctx.state.playerBoard[0]=muid;ctx.resetTurnAttacks('player');await ctx.attack('player',0);
  check(muid.canAttack&&muid.attacksUsedThisTurn===1&&ctx.state.enemyDefense[0]===1,'21 first attack leaves one attack');await ctx.attack('player',0);
  check(!muid.canAttack&&muid.attacksUsedThisTurn===2&&ctx.state.enemyDefense[0]===2,'21 second attack breaches intact lane');const life=ctx.state.enemyLife;await ctx.attack('player',0);
  check(ctx.state.enemyLife===life&&muid.attacksUsedThisTurn===2,'22 third attack denied');
  ctx.state.playerDeck=[unit()];ctx.state.enemyDeck=[unit()];await ctx.prepareNextTurn('enemy');await ctx.prepareNextTurn('player');
  check(ctx.remainingAttacks(muid)===2,'23 owning turn resets to two');
  reset();muid=unit(M);ctx.state.enemyHand=[muid];await ctx.executePlayAction({side:'enemy',card:muid,handIndex:0,cost:7,lane:0,mode:'normal'});
  check(!muid.canAttack&&ctx.remainingAttacks(muid)===0,'24 no haste means no attack on placement turn');
  reset();muid=unit(M);ctx.state.enemyBoard[4]=unit('強襲の指揮官');ctx.state.enemyHand=[muid];await ctx.executePlayAction({side:'enemy',card:muid,handIndex:0,cost:7,lane:0,mode:'normal'});
  check(ctx.remainingAttacks(muid)===2,'25 commander haste grants two immediate attacks');
  await ctx.executeAttackAction({side:'enemy',lane:0,destination:0,card:muid});await ctx.executeAttackAction({side:'enemy',lane:0,destination:0,card:muid});check(!muid.canAttack&&ctx.state.playerDefense[0]===2,'CPU executes both attacks and advances defense');
  check(!await ctx.executeAttackAction({side:'enemy',lane:0,destination:0,card:muid}),'CPU third attack denied');
  // Permanent deck buffs are attached only to unit instances presently in the deck.
  reset();let abel=unit(A),deckUnit=unit(),deckSpell=unit('処刑'),deckLM=unit('クロスフォート城'),hand=unit(),grave=unit(),field=unit();
  ctx.state.enemyBoard[0]=abel;ctx.state.enemyBoard[1]=field;ctx.state.enemyBoard[2]=unit();ctx.state.enemyDeck=[deckUnit,deckSpell,deckLM];ctx.state.enemyHand=[hand];ctx.state.enemyGrave=[grave];
  await ctx.destroy('enemy',2);check(deckUnit.power===3&&deckUnit.permanentPowerBonus===1,'26 all deck units receive permanent plus one');
  check(deckSpell.power===undefined&&deckLM.power===undefined&&!deckSpell.permanentPowerBonus&&!deckLM.permanentPowerBonus,'27 nonunits are not buffed');
  check(hand.power===2&&grave.power===2&&field.power===2&&abel.power===4,'28 other zones and source excluded');
  ctx.state.enemyBoard[2]=unit();await ctx.destroy('enemy',2);check(deckUnit.power===4&&deckUnit.permanentPowerBonus===2,'29 repeated destruction accumulates');
  ctx.state.enemyLandmarks[3]=unit('クロスフォート城');await ctx.destroyLandmark('enemy',3);check(deckUnit.power===4,'landmark destruction excluded');
  await ctx.destroy('enemy',0);check(deckUnit.power===4,'30 own destruction excluded');
  await ctx.drawCard('enemy');check(ctx.state.enemyHand.includes(deckUnit)&&deckUnit.power===4,'31 drawn buffed unit preserves power');
  ctx.state.enemyBoard[1]=deckUnit;deckUnit.power+=3;await ctx.destroy('enemy',1);
  check(ctx.state.enemyGrave.includes(deckUnit)&&deckUnit.power===4&&deckUnit.permanentPowerBonus===2,'32 permanent bonus survives grave reset');
  check(deckUnit.basePower===2&&deckUnit.power===deckUnit.basePower+deckUnit.permanentPowerBonus,'33 temporary plus three removed independently');
  await ctx.deployFromZone('enemy',ctx.state.enemyGrave,{onlyCard:deckUnit});check(ctx.state.enemyBoard.includes(deckUnit)&&deckUnit.power===4,'buff persists through actual grave redeployment');
  reset();let normal=unit();normal.canAttack=true;ctx.state.playerBoard[0]=normal;await ctx.attack('player',0);const defense=ctx.state.enemyDefense[0];await ctx.attack('player',0);check(!normal.canAttack&&ctx.state.enemyDefense[0]===defense,'normal units still attack once');
  reset();let haste=unit('帝国の突撃兵');ctx.state.enemyHand=[haste];await ctx.executePlayAction({side:'enemy',card:haste,handIndex:0,cost:haste.cost,lane:0,mode:'normal'});check(haste.canAttack,'ordinary haste still works');
  await ctx.executeAttackAction({side:'enemy',lane:0,destination:0,card:haste});check(!haste.canAttack,'ordinary haste still only attacks once');
  reset();let reduced=unit('王室近衛兵');ctx.state.playerBoard[0]=reduced;const printed=reduced.power;await ctx.damage(ctx.state.playerBoard,0,1,'player',false,{sourceType:'combat'});check(reduced.power===printed,'ordinary damage reduction still works');
  reduced.power=3;await ctx.damage(ctx.state.playerBoard,0,2,'player',true,{sourceType:'combat'});check(!ctx.state.playerBoard[0],'ordinary lethal still destroys after positive reduced damage');
  reset();ctx.state.enemyBoard[0]=unit(H);ctx.state.enemyBoard[1]=unit('白龍エルレハイヌ');ctx.state.enemyBoard[2]=unit('群れ呼び蜥蜴');
  check(ctx.chooseCpuTarget('enemy','enemy',[1,2],'破壊する',{action:{type:'destroyAndRedeployOther'}})===1,'AI prioritizes white dragon placement reuse');
  check(ctx.aiRedeployValue(unit('亜龍イザルクリューネ'),'enemy',1)>=ctx.aiRedeployValue(unit('強襲の指揮官'),'enemy',1),'AI values replay effects over sacrificing ongoing commander aura');
  reset();muid=unit(M);muid.canAttack=true;ctx.state.enemyBoard[0]=muid;
  check(ctx.aiProjectedCombatDamage('enemy',false)===5,'AI projection includes intact to cracked to breached second hit');ctx.state.playerDefense[0]=2;
  check(ctx.aiProjectedCombatDamage('enemy',false)===12,'AI projection includes two breached-lane hits');
  const late=ctx.evaluateCard(unit(A),'enemy');ctx.state.enemyDeck=Array.from({length:20},()=>unit());check(ctx.evaluateCard(unit(A),'enemy')>late,'AI values Abel more with units remaining in deck');
  reset();let corld=unit('港印卿コルドロッホ'),revived=unit('白龍エルレハイヌ');ctx.state.enemyBoard[0]=corld;ctx.state.enemyGrave=[revived];ctx.state.enemyDeck=[unit(),unit(),unit()];await ctx.triggerCard(corld,'onPlay','enemy',0,{});
  check(ctx.state.enemyBoard.includes(revived)&&ctx.state.enemyHand.length===3,'Coldroch grave deployment still triggers onPlay');
  reset();let recovered=unit();ctx.state.enemyGrave=[recovered];await ctx.triggerCard(unit('コールティガの港湾労働者'),'onPlay','enemy',0,{});check(ctx.state.enemyHand.includes(recovered)&&!ctx.state.enemyGrave.length,'ordinary grave recovery still works');
  reset();muid=unit(M);ctx.state.enemyBoard[0]=muid;await ctx.applyLaneStatus('enemy',0,'burning');check(muid.power===4&&!ctx.hasLaneStatus('enemy',0,'burning'),'burning still damages MuIdas');
  await ctx.executeActions([{type:'setPower',target:'opposing',amount:2}],'player',0,unit('投獄'),{});check(muid.power===2,'power changes bypass combat immunity');
  await ctx.executeActions([{type:'damageSelf',amount:1}],'enemy',0,muid,{});check(muid.power===1,'end-turn effect damage bypasses combat immunity');
  reset();muid=unit(M);muid.canAttack=true;ctx.state.enemyBoard[0]=muid;await ctx.executeAttackAction({side:'enemy',lane:0,destination:0,card:muid});ctx.state.extraTurns.enemy=1;ctx.state.enemyDeck=[unit()];await ctx.beginExtraTurn('enemy');check(ctx.remainingAttacks(muid)===2,'extra turns reset two attacks');
  reset();hevi=unit(H);dragon=unit('白龍エルレハイヌ');ctx.state.playerBoard[0]=hevi;ctx.state.playerBoard[1]=dragon;ctx.state.playerDeck=[unit(),unit(),unit()];
  const replay=ctx.triggerCard(hevi,'onPlay','player',0,{});
  async function until(test){for(let i=0;i<100;i++){if(test())return;await Promise.resolve()}throw new Error('selection did not appear')}
  await until(()=>ctx.state.targetRequest);check(JSON.stringify(Array.from(ctx.state.targetRequest.candidates))==='[1]','human target picker contains only eligible ally');ctx.resolveTarget('player',1);
  await until(()=>ctx.state.choiceRequest);check(ctx.state.grave.includes(dragon)&&ctx.state.choiceRequest.cards[0]===dragon,'human sees exact destroyed card in grave picker');ctx.resolvePicker(0);
  await until(()=>ctx.state.targetRequest);check(!ctx.state.targetRequest.candidates.includes(1)&&!ctx.state.targetRequest.candidates.includes(0),'human destination picker excludes original and occupied slots');ctx.resolveTarget('player',2);await replay;
  check(ctx.state.playerBoard[2]===dragon&&ctx.state.playerHand.length===3,'human replay completes with onPlay');
  console.log(`${checks} moon-god regression assertions passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
