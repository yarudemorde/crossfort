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
run("state={playerBoard:Array(5).fill(null),enemyBoard:Array(5).fill(null),playerLandmarks:Array(5).fill(null),enemyLandmarks:Array(5).fill(null)}");

let checks=0;
function check(value,message){assert.ok(value,message);checks++}
const iconFiles=['guardian.png','lethal.png','rush.png','piercing.png','dive.png','soul-echo.png','retaliation.png','explore.png','discover.png','faith.png','unblockable.png','cannot-attack.png'];
for(const file of iconFiles){
  const png=fs.readFileSync(path.join(dir,'assets/icons/keywords',file));
  check(png.subarray(1,4).toString()==='PNG',`${file} is a PNG image`);
  check(png.readUInt32BE(16)===32&&png.readUInt32BE(20)===32,`${file} is exactly 32x32`);
  check([4,6].includes(png[25]),`${file} stores an alpha channel`);
}

const cases=[
  ['クロスフォート兵','guardian.png','守護'],
  ['毒牙の蜥蜴','lethal.png','殺傷'],
  ['帝国の突撃兵','rush.png','猛襲'],
  ['帝国の騎馬隊','piercing.png','貫通'],
  ['人食いクラゲ','dive.png','潜水'],
  ['女教皇アウローン','soul-echo.png','魂響'],
  ['原始的な投槍','retaliation.png','報復'],
  ['サルベージ','explore.png','探査'],
  ['砂漠の贈賄者','discover.png','発見'],
  ['アウロニア信者','faith.png','信仰'],
  ['クロスフォートの城壁','cannot-attack.png','攻撃不可']
];
for(const [name,file,label] of cases){
  const badges=ctx.keywordBadges(card(name),'player');
  check(badges.includes(`assets/icons/keywords/${file}`)&&badges.includes(`alt="${label}"`),`${label} uses its PNG icon`);
}
ctx.CARD_RULES['複合キーワード検証']={keywords:['guard','lethal','haste','pierce','unblockable'],dive:1,revenge:1,onDiscover:[{type:'draw'}],onDestroyed:[{type:'soulEcho'}]};
const combo={name:'複合キーワード検証',cost:1,power:2,type:'ユニット',text:'■ 探査：2\n■ 発見\n■ 信仰：2\n■ 魂響',color:'黒',canAttack:true};
const comboBadges=ctx.keywordBadges(combo,'player');
for(const file of iconFiles.filter(file=>file!=='cannot-attack.png')) check(comboBadges.includes(file),`multiple-keyword card includes ${file}`);
check(!ctx.keywordBadges(card('危険な釣り人'),'player').includes('dive.png'),'cards that only refer to dive do not receive a dive icon');
check(!ctx.keywordBadges(card('危険海域'),'player').includes('dive.png'),'landmarks that support dive do not receive a dive icon');
check(!ctx.keywordBadges({name:'通常ユニット',type:'ユニット',power:1,text:'',color:'白'},'player'),'cards without keywords add no empty icon row');
check(!ctx.keywordBadges(card('クロスフォート兵'),'player').includes('<svg'),'keyword rendering contains no inline SVG');
check(!/battlefieldKeywordEffects|animateKeywordEffect|animatePlacement|keywordAura|keywordMoment|keywordFx/.test(html+css),'keyword effect DOM, JavaScript, classes, and animations are removed');
check(!/\.keywordIcon\.(guard|lethal|pierce|haste|unblockable|cannotAttack)\s*\{/.test(html+css),'legacy per-keyword CSS shape icons are removed');
check(/\.keywordIcon img\{[^}]*image-rendering:pixelated/.test(html+css),'keyword PNGs use pixelated rendering');
check(/clamp\(18px,1\.25vw,22px\)/.test(css),'desktop keyword icons stay within the requested 18-22px range');
check(/#gameScreen \.card \.keywordIcon\{width:15px;height:15px/.test(css),'mobile battlefield icons render at a compact 15px');
const boardSource=html.slice(html.indexOf('function renderBoard'),html.indexOf('function renderLandmarks'));
const handSource=html.slice(html.indexOf('function renderHand'),html.indexOf("window.addEventListener('resize'"));
const catalogSource=html.slice(html.indexOf('function renderCatalog'),html.indexOf('function showComingSoon'));
const detailSource=html.slice(html.indexOf('function showCardDetail'),html.indexOf('function hideCardDetail'));
check(boardSource.includes('keywordBadges(u,side)'),'battlefield cards render the shared PNG icon row');
check(!handSource.includes('keywordBadges')&&!catalogSource.includes('keywordBadges')&&!detailSource.includes('keywordBadges'),'hand, catalog, deck editor, and enlarged detail keep their existing text-only keyword presentation');
check(html.includes('parchment.css?v=13'),'clients receive the updated icon stylesheet without stale cache reuse');
check(!/(炎上|burning\.png|burn-icon)/.test(html+css+iconFiles.join('\n')),'unimplemented third-set burning assets were not added');
console.log(`${checks} keyword-icon regression assertions passed`);
