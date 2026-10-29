const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),nodes=new Map();
function element(id){
 if(!nodes.has(id))nodes.set(id,{style:{},children:[],innerHTML:'',textContent:'',hidden:false,classList:{add(){},remove(){},toggle(){},contains(){return false;}},setAttribute(){},getAttribute(){return null;},addEventListener(){},querySelector(){return element(id+'-child');},querySelectorAll(){return [];}});
 return nodes.get(id);
}
const ctx=vm.createContext({console,Math,setTimeout,clearTimeout,localStorage:{getItem(){return null;},setItem(){}},document:{body:element('body'),documentElement:element('html'),getElementById:element,querySelector(){return null;},querySelectorAll(){return [];},createElement(){return element('created');}},window:{addEventListener(){},scrollTo(){}},MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){}});
for(const f of ['data/cards.js','data/card-rules.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
vm.runInContext("render=renderStableBattle=renderDefenseLine=renderBattleHud=showDefenseShield=showPowerGain=showDamage=showDestroy=showLandmarkCollapse=animateSummon=animateLandmark=animateCard=pulseClass=showSelectionBanner=function(){};wait=async function(){};boardCard=function(){return null;};chooseTarget=async function(side,targetSide,prompt,filter){var b=boardFor(targetSide);for(var i=0;i<5;i++)if(b[i]&&(!filter||filter(b[i],i)))return {side:targetSide,index:i};return null;};",ctx);
function fresh(){
 ctx.cancelBattleFeedback();ctx.clearAttackPreview(false);
 ctx.state={generation:1,gameOver:false,animating:false,matchMode:'local',playerTurn:true,turn:1,firstSide:'player',playerLife:20,enemyLife:20,mana:10,enemyMana:10,maxMana:10,enemyMaxMana:10,playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null),playerHand:[],enemyHand:[],playerDeck:[],enemyDeck:[],grave:[],enemyGrave:[],playerDefense:Array(5).fill(0),enemyDefense:Array(5).fill(0),playerLaneStates:Array.from({length:5},()=>({})),enemyLaneStates:Array.from({length:5},()=>({})),selectedCard:-1,selectedSlot:-1,battleHistory:[]};
 return ctx.state;
}
function unit(name,power=3,rules={}){ctx.CARD_RULES[name]=rules;return {name,power,basePower:power,type:'ユニット',color:'白',text:'',cost:2,canAttack:true};}
function card(name){const t=ctx.cardTemplateByName(name);return ctx.cloneCard(t.row,t.color);}
let checks=0;function check(value,msg){assert.ok(value,msg);checks++;}
(async()=>{
 let s=fresh(),a=unit('攻撃元',4),t=unit('正面',3);s.playerBoard[2]=a;s.enemyBoard[2]=t;const initial=JSON.stringify(s);
 const prediction=ctx.predictAttack('player',2);check(JSON.stringify(s)===initial,'prediction is read-only');
 ctx.selectAttackPreview('player',2);check(JSON.stringify(s)===initial&&ctx.battlePreview.card===a,'selection creates preview only');
 ctx.clearAttackPreview(true);check(JSON.stringify(s)===initial,'cancel consumes nothing');
 s.playerBoard[3]=unit('切替',2);ctx.selectAttackPreview('player',2);ctx.selectAttackPreview('player',3);check(ctx.battlePreview.card===s.playerBoard[3],'another attacker replaces preview');
 ctx.selectAttackPreview('player',2);const first=ctx.confirmAttackPreview(),second=ctx.confirmAttackPreview();await Promise.all([first,second]);
 check(s.enemyBoard[2]===null&&s.playerBoard[2].power===1&&!s.playerBoard[2].canAttack,'confirm executes combat exactly once');
 check(!ctx.battlePreview&&!s.animating,'confirmation releases preview and input lock');
 s=fresh();a=unit('守護確認攻撃',3);s.playerBoard[2]=a;s.enemyBoard[2]=unit('正面',1);s.enemyBoard[1]=unit('隣の守護',5,{keywords:['guard']});
 check(ctx.predictAttack('player',2).targetIndex===1,'adjacent guard precedes front defender');
 s.enemyBoard[3]=unit('二枚目の守護',4,{keywords:['guard']});check(ctx.predictAttack('player',2).targetIndex===1,'overlapping guards use slot order');
 s.enemyBoard[1]=null;s.enemyBoard[3]=null;s.enemyBoard[0]=unit('遠い守護',9,{keywords:['guard']});check(ctx.predictAttack('player',2).targetIndex===2,'distant guard does not defend');
 ctx.CARD_RULES[a.name]={keywords:['unblockable']};check(ctx.predictAttack('player',2).target===null,'unblockable bypasses all defenders');
 s=fresh();a=unit('貫通攻撃',5,{keywords:['pierce']});s.playerBoard[2]=a;s.enemyBoard[2]=unit('防衛',2);s.enemyDefense[2]=1;let p=ctx.predictAttack('player',2);
 check(p.pierce&&p.lifeDamage===3&&p.defenseAfter===2,'pierce uses current defense-line damage rule');ctx.selectAttackPreview('player',2);await ctx.confirmAttackPreview();check(s.enemyLife===17&&s.enemyDefense[2]===2,'pierce forecast matches execution');
 for(let stage=0;stage<3;stage++){s=fresh();a=unit('直接攻撃',3);s.playerBoard[1]=a;s.enemyDefense[1]=stage;const p=ctx.predictAttack('player',1);ctx.selectAttackPreview('player',1);await ctx.confirmAttackPreview();check(20-s.enemyLife===p.lifeDamage&&s.enemyDefense[1]===p.defenseAfter,'direct forecast matches defense stage '+stage);}
 s=fresh();s.playerBoard[1]=unit('殺傷攻撃',1,{keywords:['lethal']});s.enemyBoard[1]=unit('巨大ユニット',10);check(ctx.predictAttack('player',1).hit.destroyed,'lethal predicts destruction from nonzero damage');
 ctx.CARD_RULES['巨大ユニット']={damageReduction:1};check(!ctx.predictAttack('player',1).hit.destroyed&&ctx.predictAttack('player',1).hit.damage===0,'zero damage cannot apply lethal');
 ctx.CARD_RULES['巨大ユニット']={combatDamageImmune:true};check(ctx.predictAttack('player',1).hit.damage===0,'combat immunity is included');
 s=fresh();a=unit('追加攻撃',4,{maxAttacksPerTurn:2,keywords:['haste']});s.playerBoard[0]=a;ctx.selectAttackPreview('player',0);await ctx.confirmAttackPreview();check(ctx.remainingAttacks(a)===1,'first attack preserves the second attack');ctx.selectAttackPreview('player',0);await ctx.confirmAttackPreview();check(ctx.remainingAttacks(a)===0,'second attack is consumed once');
 s=fresh();a=unit('攻撃不可',3,{keywords:['cannotAttack']});s.playerBoard[0]=a;ctx.selectAttackPreview('player',0);check(!ctx.battlePreview,'cannot-attack cards cannot enter preview');
 s=fresh();a=unit('移動攻撃',4,{moveOnAttack:true});s.playerBoard[2]=a;s.enemyBoard[1]=unit('移動先の敵',1);const before=JSON.stringify(s);ctx.selectAttackPreview('player',2);check(ctx.battlePreview.choosingLane,'movable attacker asks for lane first');ctx.setAttackPreviewLane(1);check(JSON.stringify(s)===before&&ctx.predictAttack('player',2,1).target===s.enemyBoard[1],'destination preview does not actually move card');await ctx.confirmAttackPreview();check(s.playerBoard[1]===a&&!s.playerBoard[2]&&s.enemyBoard[1]===null,'confirmed attack uses chosen lane');
 s=fresh();a=unit('攻撃時効果',3,{onAttack:[{type:'damageLife',amount:1,target:'enemy'}]});s.playerBoard[0]=a;check(ctx.predictAttack('player',0).reasons.includes('攻撃時効果が発動'),'attack triggers mark result uncertain');
 s=fresh();s.playerBoard[0]=unit('本体攻撃',4);s.enemyDefense[0]=1;s.enemyHand=[card('原始的な投槍')];check(ctx.predictAttack('player',0).reasons.some(x=>x.includes('報復')),'available revenge marks uncertainty');
 s=fresh();a=unit('古い攻撃',3);s.playerBoard[0]=a;ctx.selectAttackPreview('player',0);s.playerBoard[0]=unit('新しいユニット',4);await ctx.confirmAttackPreview();check(s.playerBoard[0].canAttack&&s.enemyLife===20,'stale preview cannot attack replacement card');
 // Nested effects retain existing executor order and do not overlap UI phases.
 s=fresh();const caster=unit('連続元',1),victim=unit('破壊対象',2,{onDestroyed:[{type:'damageLife',target:'enemy',amount:1}]}),survivor=unit('生存誘発',1,{onFriendlyDestroyed:[{type:'buffSelf',amount:1}]});
 s.playerBoard[0]=caster;s.enemyBoard[0]=victim;s.enemyBoard[1]=survivor;s.playerDeck=[card('農民')];let trace=[];
 const originalBegin=ctx.beginEffectPresentation,originalEnd=ctx.endEffectPresentation;
 ctx.beginEffectPresentation=async function(c,...args){trace.push('begin:'+c.name);return originalBegin(c,...args);};
 ctx.endEffectPresentation=async function(frame){await originalEnd(frame);trace.push('end:'+frame.card.name);};
 await ctx.executeActions([{type:'damageUnit',target:'enemyUnit',amount:2},{type:'draw',amount:1}],'player',0,caster,{});
 check(s.enemyBoard[0]===null&&survivor.power===2&&s.playerLife===19&&s.playerHand.length===1,'nested death, friendly trigger and next action all resolve');
 check(trace.join('|')==='begin:連続元|begin:生存誘発|end:生存誘発|begin:破壊対象|end:破壊対象|end:連続元|begin:連続元|end:連続元','visual phases preserve original nested resolution order');
 check(s.battleHistory.some(e=>e.source==='連続元'&&e.text.includes('2ダメージ'))&&s.battleHistory.some(e=>e.source==='破壊対象'&&e.text.includes('LIFE -1')),'effect history records individual sources and numeric results');
 check(!ctx.battleFeedbackBusy(),'all nested presentation frames drain');
 s=fresh();const retaliation=unit('報復発動元',1,{revenge:3,keywords:['lethal']}),selfSpell=unit('自傷の発動元',1);s.playerHand=[retaliation];
 const oldRevengeChoice=ctx.chooseRevengeCard,oldOpenSlot=ctx.chooseOpenSlot;
 ctx.chooseRevengeCard=async()=>retaliation;ctx.chooseOpenSlot=async()=>1;
 await ctx.executeActions([{type:'damageLife',target:'self',amount:3}],'player',-1,selfSpell,{});
 check(s.playerLife===17&&s.playerBoard[1]===retaliation,'revenge still resolves within the original life-change action');
 check(s.battleHistory.some(e=>e.source==='報復発動元'&&e.text.includes('レーン2に配置'))&&!s.battleHistory.some(e=>e.source==='自傷の発動元'&&e.text.includes('レーン2に配置')),'revenge deployment belongs to its own source, not the parent spell');
 check(!ctx.battleFeedbackBusy(),'revenge presentation releases its nested frame');
 ctx.chooseRevengeCard=oldRevengeChoice;ctx.chooseOpenSlot=oldOpenSlot;
 s=fresh();s.enemyHand=[card('【狩猟の月】オイタネヴ')];await ctx.emitFriendlyAction('enemy','onFriendlyAttack',{});
 check(s.enemyHand[0].power===2&&s.battleHistory.some(e=>e.source==='【狩猟の月】オイタネヴ'),'hand effects have individual history');
 s=fresh();const relic=card('サントラーヴ・ベイ');s.enemyLandmarks[0]=relic;await ctx.destroyLandmark('enemy',0);
 check(s.enemyGrave.includes(relic)&&!ctx.battleFeedbackBusy(),'landmark death feedback completes without changing grave behaviour');
 s=fresh();a=unit('中断元',1,{onPlay:[{type:'draw',amount:1}]});s.playerBoard[0]=a;s.playerDeck=[card('農民')];
 let release;const oldPause=ctx.feedbackPause;ctx.feedbackPause=()=>new Promise(r=>release=r);
 const pending=ctx.triggerCard(a,'onPlay','player',0,{}).catch(e=>e);await Promise.resolve();s.generation++;ctx.cancelBattleFeedback();release();const error=await pending;
 check(error===ctx.staleBattle&&s.playerHand.length===0&&!ctx.battleFeedbackBusy(),'interruption cannot resume effects in a new generation');ctx.feedbackPause=oldPause;
 check(html.includes('selectAttackPreview(side,index)')&&html.includes('battlePrimaryAction()'),'board and controls use preview entry points');
 console.log(checks+' attack preview and effect-chain checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
