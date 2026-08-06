'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const STORE='grana.1.0';
const BACKUP_FORMAT='grana-backup';
const BACKUP_VERSION='1.1';
const LEGACY_STORES=['kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.1.0','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v12','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v11','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v10','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v9','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v8','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v7','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v6','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v5','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v4','kalkulator'+String.fromCharCode(75,97,110,116,111,114)+'.v3'];
const defaults={history:[],retention:0,precision:8,liveResult:true,thousandsSeparator:true,appearance:'warm',animations:true,version1:true,backupReminder:false,backupInterval:7,lastBackup:0,lastBackupPrompt:0};
let state=load(), expression='', lastResult=0, selectedId=null, dialogMode='note', cursorPos=0, addedId=null;

function load(){
  try{
    const current=localStorage.getItem(STORE);
    const legacy=LEGACY_STORES.map(k=>localStorage.getItem(k)).find(Boolean);
    const parsed=JSON.parse(current||legacy||'{}');
    const migrated={...defaults,...parsed,history:Array.isArray(parsed.history)?parsed.history:[]};
    migrated.retention=Number.isFinite(Number(migrated.retention))?Number(migrated.retention):0;
    if(migrated.appearance==='dark')migrated.appearance='graphite';
    if(migrated.appearance==='navy')migrated.appearance='warm';
    migrated.animations=parsed.animations!==false;
    migrated.history=migrated.history.map(x=>{
      const raw=Number.isFinite(Number(x.resultValue))?Number(x.resultValue):parseStoredResult(x.result);
      return {...x,expression:extractExpression(x.expression),resultValue:Number.isFinite(raw)?raw:undefined};
    });
    return migrated;
  }catch{return {...defaults}}
}
function save(){localStorage.setItem(STORE,JSON.stringify(state))}
function applyPreferences(){
  const mode=state.appearance||'system';
  if(mode==='system')document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme',mode);
  document.documentElement.toggleAttribute('data-no-animations',!state.animations);
  const themeColors={system:'#15171b',graphite:'#12151c',gray:'#202020',warm:'#1b1916',light:'#eef1f6'};
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themeColors[mode]||themeColors.system);
}
function id(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cleanOld(){if(!state.retention)return;const cutoff=Date.now()-state.retention*864e5;state.history=state.history.filter(x=>x.created>=cutoff);save()}
function normalize(s){return String(s).replace(/[\s\u00a0\u202f]+/gu,'').replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').replaceAll(',','.')}
function tokenize(s){const src=normalize(s),out=[];let i=0;while(i<src.length){const c=src[i];if(/[0-9.]/.test(c)){let n=c;i++;while(i<src.length&&/[0-9.eE]/.test(src[i]))n+=src[i++];if(!Number.isFinite(Number(n)))throw Error('Nieprawidłowa liczba');out.push({t:'n',v:Number(n)});continue}if('+-*/()'.includes(c)){out.push({t:c,v:c});i++;continue}throw Error('Nieprawidłowy znak')}return out}
function evaluate(src){const ts=tokenize(src),vals=[],ops=[];const prec={'+':1,'-':1,'*':2,'/':2,'u-':3};const apply=()=>{const o=ops.pop();if(o==='u-'){if(!vals.length)throw Error('Błąd składni');vals.push(-vals.pop());return}const b=vals.pop(),a=vals.pop();if(a===undefined||b===undefined)throw Error('Błąd składni');if(o==='+')vals.push(a+b);else if(o==='-')vals.push(a-b);else if(o==='*')vals.push(a*b);else{if(b===0)throw Error('Dzielenie przez zero');vals.push(a/b)}};let prev='start';for(const x of ts){if(x.t==='n'){vals.push(x.v);prev='value';continue}if(x.t==='('){ops.push('(');prev='(';continue}if(x.t===')'){while(ops.length&&ops.at(-1)!=='(')apply();if(ops.pop()!=='(')throw Error('Brak nawiasu');prev='value';continue}let o=x.t;if(o==='-'&&(prev==='start'||prev==='('||prev==='op'))o='u-';while(ops.length&&ops.at(-1)!=='('&&prec[o]<=prec[ops.at(-1)])apply();ops.push(o);prev='op'}while(ops.length){if(ops.at(-1)==='(')throw Error('Brak nawiasu');apply()}if(vals.length!==1||!Number.isFinite(vals[0]))throw Error('Błąd obliczenia');return vals[0]}
function parseStoredResult(value){const normalized=String(value??'').replace(/[\s\u00a0\u202f]+/gu,'').replace(',','.');const n=Number(normalized);return Number.isFinite(n)?n:NaN}
function historyResult(x){return Number.isFinite(Number(x.resultValue))?format(Number(x.resultValue)):String(x.result??'')}
function format(n){if(!Number.isFinite(n))return 'Błąd';const p=Number(state.precision);const s=Number(n.toPrecision(Math.min(15,p+5))).toLocaleString('pl-PL',{maximumFractionDigits:p,useGrouping:state.thousandsSeparator});return s==='-0'?'0':s}
function editableNumber(n){if(!Number.isFinite(n))return '';const p=Number(state.precision);const s=Number(n.toPrecision(Math.min(15,p+5))).toLocaleString('pl-PL',{maximumFractionDigits:p,useGrouping:false});return s==='-0'?'0':s.replace('-', '−')}
function extractExpression(value){let text=String(value??'').trim();if(!text)return '';text=text.split(/\r?\n/)[0].trim();if(text.includes('='))text=text.split('=')[0].trim();return text.replace(/\s+(?:\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}).*$/,'').trim()}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function dateText(ms){return new Intl.DateTimeFormat('pl-PL',{dateStyle:'short',timeStyle:'medium'}).format(ms)}

const expressionInput=$('#expression');
function visualExpression(raw){
  const items=[];let i=0;
  while(i<raw.length){
    if(/\d/.test(raw[i])){
      const start=i;while(i<raw.length&&/[\d,]/.test(raw[i]))i++;
      const token=raw.slice(start,i),comma=token.indexOf(','),intLen=comma<0?token.length:comma;
      for(let j=0;j<token.length;j++){
        if(state.thousandsSeparator&&j>0&&j<intLen&&(intLen-j)%3===0)items.push({ch:'\u202f',before:start+j,after:start+j,sep:true});
        items.push({ch:token[j],before:start+j,after:start+j+1});
      }
    }else{items.push({ch:raw[i],before:i,after:i+1});i++}
  }
  return items;
}
function expressionFontSize(){const n=expression.length;if(n<=13)return 36;if(n<=20)return 32;if(n<=29)return 28;if(n<=40)return 24;return 21}
function renderExpression(){
  expressionInput.textContent='';expressionInput.style.fontSize=expressionFontSize()+'px';
  if(!expression){const z=document.createElement('span');z.className='placeholder';z.textContent='0';expressionInput.append(z);return}
  const items=visualExpression(expression);let lastPos=-1;
  for(const item of items){
    if(item.before!==lastPos&&item.before===cursorPos){const c=document.createElement('span');c.className='editor-caret';c.setAttribute('aria-hidden','true');expressionInput.append(c)}
    const ch=document.createElement('span');ch.className=item.sep?'editor-separator':'editor-char';ch.textContent=item.ch;ch.dataset.before=String(item.before);ch.dataset.after=String(item.after);expressionInput.append(ch);lastPos=item.before;
  }
  if(cursorPos===expression.length){const c=document.createElement('span');c.className='editor-caret';c.setAttribute('aria-hidden','true');expressionInput.append(c)}
  requestAnimationFrame(()=>{const caret=expressionInput.querySelector('.editor-caret');if(caret)expressionInput.scrollLeft=Math.max(0,caret.offsetLeft-expressionInput.clientWidth+28)});
}
function render(){renderExpression();let r='0';if(expression&&state.liveResult){try{r=format(evaluate(expression))}catch{r='…'}}else r=format(lastResult);$('#result').textContent=r;renderRecent()}
function insertText(text){const start=cursorPos;let token=text;const operators='+−×÷';if(operators.includes(token)&&start>0&&operators.includes(expression[start-1])){expression=expression.slice(0,start-1)+token+expression.slice(start);cursorPos=start;render();return}if(token===','){const left=expression.slice(0,start),tail=left.split(/[+−×÷()]/).at(-1);if(tail.includes(','))return;if(!tail||!(/\d$/.test(tail)))token='0,'}expression=expression.slice(0,start)+token+expression.slice(start);cursorPos=start+token.length;render()}
function backspace(){if(cursorPos>0){expression=expression.slice(0,cursorPos-1)+expression.slice(cursorPos);cursorPos--}render()}
function placeCursorFromPoint(clientX){if(!expression){cursorPos=0;render();return}const chars=[...expressionInput.querySelectorAll('.editor-char,.editor-separator')];let best=expression.length,bestDist=Infinity;for(const ch of chars){const r=ch.getBoundingClientRect(),mid=r.left+r.width/2,before=Number(ch.dataset.before),after=Number(ch.dataset.after),pos=clientX<mid?before:after,edge=clientX<mid?r.left:r.right,d=Math.abs(clientX-edge);if(d<bestDist){bestDist=d;best=pos}}cursorPos=Math.max(0,Math.min(best,expression.length));render()}
function calculate(saveHistory=true){if(!expression)return;try{const original=expression,v=evaluate(expression);lastResult=v;if(saveHistory)addHistory(original,v);expression=editableNumber(v);cursorPos=expression.length;render()}catch(e){toast(e.message||'Nieprawidłowe działanie')}}
function addHistory(expr,value){const now=Date.now(),entryId=id();state.history.unshift({id:entryId,expression:extractExpression(expr),result:format(value),resultValue:value,created:now,updated:now,comment:''});addedId=entryId;cleanOld();save();renderHistory();renderRecent();setTimeout(()=>addedId=null,100)}
async function pasteIntoCalculator(){try{let text=(await navigator.clipboard.readText()).trim();if(!text)throw 0;const firstLine=text.split(/\r?\n/)[0],candidate=extractExpression(firstLine);evaluate(candidate);insertText(candidate);toast('Wklejono obliczenie')}catch{toast('Safari nie udostępniło schowka')}}
function pressAction(a){if(a==='clear'){expression='';lastResult=0;cursorPos=0;render()}else if(a==='backspace')backspace();else if(a==='equals')calculate()}
function renderRecent(){const box=$('#recentList');if(!box)return;const items=state.history.slice(0,3);if(!items.length){box.innerHTML='<div class="recent-empty">Brak ostatnich obliczeń</div>';return}box.innerHTML=items.map(x=>`<div class="recent-item${x.id===addedId&&state.animations?' item-enter':''}" data-id="${esc(x.id)}"><span class="recent-expr">${esc(extractExpression(x.expression))}</span><span class="recent-result">= ${esc(historyResult(x))}</span></div>`).join('');for(const el of box.querySelectorAll('.recent-item'))el.addEventListener('click',()=>useEntry(el.dataset.id))}
function renderHistory(){const list=$('#historyList');list.innerHTML=state.history.length?'':'<div class="empty">Historia jest pusta</div>';for(const x of state.history){const el=document.createElement('div');el.className='history-item'+(x.id===addedId&&state.animations?' item-enter':'');el.dataset.id=x.id;el.innerHTML=`<div class="expr">${esc(extractExpression(x.expression))}</div><div class="res">${esc(historyResult(x))}</div>${x.comment?`<div class="comment">${esc(x.comment)}</div>`:''}<div class="meta"><span>${dateText(x.created)}</span></div>`;bindLongPress(el);list.append(el)}renderRecent()}
function bindLongPress(el){let t,sx,sy,longTriggered=false;const clearSelection=()=>{const sel=window.getSelection?.();if(sel&&sel.rangeCount)sel.removeAllRanges()};const stop=()=>{clearTimeout(t);t=null};el.addEventListener('selectstart',e=>e.preventDefault());el.addEventListener('dragstart',e=>e.preventDefault());el.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;longTriggered=false;clearSelection();t=setTimeout(()=>{longTriggered=true;clearSelection();openMenu(el.dataset.id,e.clientX,e.clientY)},280)});el.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>9)stop()});el.addEventListener('pointerup',e=>{stop();clearSelection();if(!longTriggered)useEntry(el.dataset.id)});el.addEventListener('pointercancel',stop);el.addEventListener('contextmenu',e=>{e.preventDefault();clearSelection();openMenu(el.dataset.id,e.clientX,e.clientY)})}
function openMenu(entryId,x,y){selectedId=entryId;const m=$('#contextMenu');m.classList.remove('hidden');const w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';m.style.top=Math.max(8,Math.min(innerHeight-h-8,y-10))+'px'}
function closeMenu(){$('#contextMenu').classList.add('hidden')}
function openDisplayMenu(x,y){const m=$('#displayMenu');m.classList.remove('hidden');const w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(innerWidth-w-8,x-w/2))+'px';m.style.top=Math.max(8,Math.min(innerHeight-h-8,y-10))+'px'}
function closeDisplayMenu(){$('#displayMenu').classList.add('hidden')}
function bindDisplayLongPress(el){let t,sx,sy;const stop=()=>{clearTimeout(t);t=null};el.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;t=setTimeout(()=>openDisplayMenu(e.clientX,e.clientY),280)});el.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-sx,e.clientY-sy)>9)stop()});el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);el.addEventListener('contextmenu',e=>{e.preventDefault();openDisplayMenu(e.clientX,e.clientY)})}
function entry(){return state.history.find(x=>x.id===selectedId)}
function useEntry(entryId){const x=state.history.find(e=>e.id===entryId);if(!x)return;const clean=extractExpression(x.expression);try{lastResult=evaluate(clean)}catch{toast('Nie można użyć tego wpisu');return}expression=clean;cursorPos=expression.length;closeDrawers();render();toast('Wstawiono samo działanie')}
function smsText(x){return `${extractExpression(x.expression)}\nSuma: ${historyResult(x)}`}
function openSendMenu(x,y){
  const m=$('#sendMenu');m.classList.remove('hidden');
  const w=m.offsetWidth,h=m.offsetHeight;
  const left=Number.isFinite(x)?x-w/2:innerWidth/2-w/2;
  const top=Number.isFinite(y)?y-10:innerHeight/2-h/2;
  m.style.left=Math.max(8,Math.min(innerWidth-w-8,left))+'px';
  m.style.top=Math.max(8,Math.min(innerHeight-h-8,top))+'px';
}
function closeSendMenu(){$('#sendMenu').classList.add('hidden')}
function sendSms(x){
  const body=encodeURIComponent(smsText(x));
  closeSendMenu();closeMenu();
  window.location.href=`sms:&body=${body}`;
}
function wrapCanvasText(ctx,text,maxWidth){
  const words=String(text).split(/\s+/),lines=[];let line='';
  for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}
  if(line)lines.push(line);return lines;
}
function calculationImageFile(x){
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
  const ctx=canvas.getContext('2d');
  const bg='#e7e0d5',panel='#f5f0e8',text='#211f1b',muted='#726b61',accent='#a66222';
  ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=panel;ctx.beginPath();ctx.roundRect(72,72,1056,656,42);ctx.fill();
  ctx.fillStyle=accent;ctx.fillRect(72,72,12,656);
    ctx.fillStyle=text;ctx.font='500 64px -apple-system, BlinkMacSystemFont, sans-serif';
  const lines=wrapCanvasText(ctx,extractExpression(x.expression),930).slice(0,3);let y=205;
  for(const line of lines){ctx.fillText(line,126,y);y+=78}
  ctx.fillStyle=text;ctx.font='700 96px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText(`Suma: ${historyResult(x)}`,126,520);
  const d=new Date(x.created);const date=new Intl.DateTimeFormat('pl-PL',{dateStyle:'long'}).format(d);const time=new Intl.DateTimeFormat('pl-PL',{timeStyle:'medium'}).format(d);
  ctx.fillStyle=muted;ctx.font='500 36px -apple-system, BlinkMacSystemFont, sans-serif';ctx.fillText(`${date}, ${time}`,126,650);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],`obliczenie-${d.toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`,{type:'image/png'})):reject(new Error('Nie udało się utworzyć obrazu')),'image/png',0.95));
}
async function sendMms(x){
  closeSendMenu();closeMenu();
  try{
    const file=await calculationImageFile(x);
    if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
      await navigator.share({files:[file]});
    }else{
      const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Obraz zapisany — udostępnij go w Wiadomościach');
    }
  }catch(e){if(e?.name!=='AbortError')toast('Nie udało się udostępnić obrazu')}
}
async function menuAction(a){const x=entry();if(!x)return;if(a==='use')useEntry(x.id);else if(a==='copy'){await copy(`${x.expression} = ${historyResult(x)}\n${dateText(x.created)}${x.comment?'\nNotatka: '+x.comment:''}`)}else if(a==='send'){const r=$('#contextMenu').getBoundingClientRect();closeMenu();openSendMenu(r.left+r.width/2,r.top+r.height/2);return}else if(a==='note')showDialog('Notatka do obliczenia',x.comment,'note');else if(a==='edit')showDialog('Edytuj zapisane obliczenie',x.expression,'edit');else if(a==='delete'&&confirm('Usunąć ten wpis?')){state.history=state.history.filter(e=>e.id!==x.id);save();renderHistory()}closeMenu()}
function showDialog(title,text,mode){dialogMode=mode;$('#dialogTitle').textContent=title;$('#dialogText').value=text;$('#textDialog').showModal();setTimeout(()=>$('#dialogText').focus(),50)}
function saveDialog(){const x=entry();if(!x)return;const value=$('#dialogText').value.trim();if(dialogMode==='note')x.comment=value;else{try{x.expression=extractExpression(value);x.resultValue=evaluate(x.expression);x.result=format(x.resultValue)}catch{toast('Nieprawidłowe działanie');return}}x.updated=Date.now();save();renderHistory()}
async function copy(text){try{await navigator.clipboard.writeText(text)}catch{const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove()}toast('Skopiowano do schowka')}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1100)}
function openDrawer(which){closeMenu();$('#drawerBackdrop').classList.remove('hidden');which.classList.add('open');which.setAttribute('aria-hidden','false');renderHistory()}
function closeDrawers(){for(const d of $$('.drawer')){d.classList.remove('open');d.setAttribute('aria-hidden','true')}$('#drawerBackdrop').classList.add('hidden')}

// Gesty poziome: kalkulator ↔ historia / ustawienia.
// Rozpoznajemy wyłącznie zdecydowany ruch poziomy, aby nie kolidował
// z przewijaniem list i obsługą przycisków.
function bindHorizontalSwipe(element,{right,left}){
  let startX=0,startY=0,tracking=false;
  const blocked='button,select,input,textarea,a,dialog,.context-menu,#expression,#result';
  element.addEventListener('touchstart',e=>{
    if(e.touches.length!==1||e.target.closest(blocked)){tracking=false;return}
    const t=e.touches[0];startX=t.clientX;startY=t.clientY;tracking=true;
  },{passive:true});
  element.addEventListener('touchend',e=>{
    if(!tracking||e.changedTouches.length!==1)return;tracking=false;
    const t=e.changedTouches[0],dx=t.clientX-startX,dy=t.clientY-startY;
    if(Math.abs(dx)<72||Math.abs(dx)<Math.abs(dy)*1.35)return;
    if(dx>0)right?.();else left?.();
  },{passive:true});
  element.addEventListener('touchcancel',()=>{tracking=false},{passive:true});
}

expressionInput.addEventListener('pointerdown',e=>{e.preventDefault();placeCursorFromPoint(e.clientX)});expressionInput.addEventListener('contextmenu',e=>e.preventDefault());
let deleteDelay=null,deleteRepeat=null;
function stopDeleteRepeat(){clearTimeout(deleteDelay);clearInterval(deleteRepeat);deleteDelay=deleteRepeat=null}
$('#keypad').addEventListener('pointerdown',e=>{const b=e.target.closest('button[data-action="backspace"]');if(!b)return;e.preventDefault();backspace();deleteDelay=setTimeout(()=>{deleteRepeat=setInterval(()=>{if(expression)backspace()},65)},300)});
for(const ev of ['pointerup','pointercancel','pointerleave'])$('#keypad').addEventListener(ev,stopDeleteRepeat);
$('#keypad').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.dataset.action==='backspace')return;b.dataset.token?insertText(b.dataset.token):pressAction(b.dataset.action)});
$('#historyBtn').onclick=()=>openDrawer($('#historyDrawer'));$('#openFullHistory').onclick=()=>openDrawer($('#historyDrawer'));$('#settingsBtn').onclick=()=>openDrawer($('#settingsDrawer'));$('#closeHistory').onclick=closeDrawers;$('#closeSettings').onclick=closeDrawers;$('#drawerBackdrop').onclick=closeDrawers;
bindHorizontalSwipe($('#app'),{right:()=>openDrawer($('#historyDrawer')),left:()=>openDrawer($('#settingsDrawer'))});
bindHorizontalSwipe($('#historyDrawer'),{left:closeDrawers});
bindHorizontalSwipe($('#settingsDrawer'),{right:closeDrawers});
$('#contextMenu').onclick=e=>{const b=e.target.closest('button');if(b)menuAction(b.dataset.menu)};$('#sendMenu').onclick=e=>{const b=e.target.closest('button');if(!b)return;const x=entry();if(b.dataset.send==='sms'&&x)sendSms(x);else if(b.dataset.send==='mms'&&x)sendMms(x);else closeSendMenu()};$('#displayMenu').onclick=e=>{const b=e.target.closest('button');if(b?.dataset.displayMenu==='paste'){pasteIntoCalculator();closeDisplayMenu()}};bindDisplayLongPress($('#result'));document.addEventListener('pointerdown',e=>{if(!e.target.closest('#contextMenu')&&!e.target.closest('.history-item'))closeMenu();if(!e.target.closest('#sendMenu')&&!e.target.closest('[data-menu="send"]'))closeSendMenu();if(!e.target.closest('#displayMenu')&&!e.target.closest('#result'))closeDisplayMenu()});
$('#dialogSave').onclick=saveDialog;$('#clearHistory').onclick=()=>{if(confirm('Usunąć całą historię?')){state.history=[];save();renderHistory()}};
syncSettingsUi();
$('#retention').onchange=e=>{state.retention=Number(e.target.value);save();cleanOld();renderHistory()};$('#appearance').onchange=e=>{state.appearance=e.target.value;save();applyPreferences()};$('#precision').onchange=e=>{state.precision=Number(e.target.value);save();render();renderHistory()};$('#liveResult').onchange=e=>{state.liveResult=e.target.checked;save();render()};$('#thousandsSeparator').onchange=e=>{state.thousandsSeparator=e.target.checked;save();render();renderHistory()};$('#animations').onchange=e=>{state.animations=e.target.checked;save();applyPreferences()};
function fileStamp(){
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
async function digestText(text){
  if(!crypto?.subtle)return null;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function backupPayload(){
  return {format:BACKUP_FORMAT,version:BACKUP_VERSION,createdAt:new Date().toISOString(),app:{name:'Grana',version:'1.1.4'},data:{history:state.history,settings:{retention:state.retention,precision:state.precision,liveResult:state.liveResult,thousandsSeparator:state.thousandsSeparator,appearance:state.appearance,animations:state.animations,backupReminder:state.backupReminder,backupInterval:state.backupInterval}}};
}
async function createBackup(){
  const payload=backupPayload(),canonical=JSON.stringify(payload.data),checksum=await digestText(canonical);
  const file={...payload,integrity:{algorithm:checksum?'SHA-256':'none',checksum}};
  downloadBlob(new Blob([JSON.stringify(file,null,2)],{type:'application/octet-stream'}),`Grana_${fileStamp()}.kcalc`);
  state.lastBackup=Date.now();state.lastBackupPrompt=Date.now();save();updateBackupUi();hideBackupPrompt();toast('Utworzono kopię zapasową');
}
function csvCell(value){return `"${String(value??'').replaceAll('"','""')}"`}
function exportCsv(){
  const rows=[['Data','Godzina','Działanie','Suma','Notatka']];
  for(const x of [...state.history].reverse()){
    const d=new Date(x.created);rows.push([new Intl.DateTimeFormat('pl-PL').format(d),new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d),extractExpression(x.expression),historyResult(x),x.comment||'']);
  }
  const csv='\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
  downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`Historia_Grana_${fileStamp()}.csv`);toast('Wyeksportowano CSV');
}
function importHistory(items){
  return items.map(x=>{const raw=Number.isFinite(Number(x.resultValue))?Number(x.resultValue):parseStoredResult(x.result);return {...x,id:x.id||id(),expression:extractExpression(x.expression),resultValue:Number.isFinite(raw)?raw:undefined,created:Number(x.created)||Date.now(),updated:Number(x.updated)||Number(x.created)||Date.now(),comment:String(x.comment||''),locked:undefined}});
}
async function importBackupFile(file){
  const obj=JSON.parse(await file.text());
  if(obj.data&&Array.isArray(obj.data.history)){
    if(obj.integrity?.algorithm==='SHA-256'&&obj.integrity.checksum){const actual=await digestText(JSON.stringify(obj.data));if(actual&&actual!==obj.integrity.checksum)throw new Error('Uszkodzona kopia');}
    if(!Array.isArray(obj.data.history))throw new Error('Brak historii');
    const settings=obj.data.settings||{};state={...state,...settings,history:importHistory(obj.data.history),lastBackup:Date.now(),lastBackupPrompt:Date.now()};
  }else if(Array.isArray(obj.history)){state.history=importHistory(obj.history)}
  else throw new Error('Nieobsługiwany plik');
  save();applyPreferences();syncSettingsUi();render();renderHistory();updateBackupUi();toast('Kopia została zaimportowana');
}
function backupDue(){
  if(!state.backupReminder)return false;
  const base=Math.max(Number(state.lastBackup)||0,Number(state.lastBackupPrompt)||0);return !base||Date.now()-base>=Number(state.backupInterval||7)*864e5;
}
function updateBackupUi(){
  const reminder=$('#backupReminder'),interval=$('#backupInterval'),row=$('#backupIntervalRow'),last=$('#lastBackup');
  if(!reminder)return;reminder.checked=!!state.backupReminder;interval.value=String(state.backupInterval||7);row.classList.toggle('disabled',!state.backupReminder);interval.disabled=!state.backupReminder;
  last.textContent=state.lastBackup?dateText(state.lastBackup):'Nigdy';
}
function showBackupPrompt(){
  if(!backupDue())return;const days=Number(state.backupInterval||7);$('#backupPromptText').textContent=`Minęło ${days===1?'co najmniej 1 dzień':`co najmniej ${days} dni`} od ostatniej kopii.`;$('#backupPrompt').classList.remove('hidden');state.lastBackupPrompt=Date.now();save();
}
function hideBackupPrompt(){$('#backupPrompt')?.classList.add('hidden')}
function syncSettingsUi(){
  $('#retention').value=String(state.retention);
  $('#precision').value=String(state.precision);
  $('#appearance').value=state.appearance;
  $('#liveResult').checked=!!state.liveResult;
  $('#thousandsSeparator').checked=!!state.thousandsSeparator;
  $('#animations').checked=!!state.animations;
  updateBackupUi();
}
$('#backupNowBtn').onclick=createBackup;$('#csvBtn').onclick=exportCsv;
$('#backupReminder').onchange=e=>{state.backupReminder=e.target.checked;save();updateBackupUi();if(state.backupReminder)setTimeout(showBackupPrompt,250)};
$('#backupInterval').onchange=e=>{state.backupInterval=Number(e.target.value);state.lastBackupPrompt=Date.now();save();updateBackupUi()};
$('#backupLater').onclick=()=>{state.lastBackupPrompt=Date.now();save();hideBackupPrompt()};$('#backupPromptNow').onclick=createBackup;
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await importBackupFile(file)}catch(err){toast(err?.message||'Nieprawidłowy plik')}finally{e.target.value=''}};
document.addEventListener('keydown',e=>{if(document.activeElement===$('#dialogText'))return;if(/\d/.test(e.key))insertText(e.key);else if(e.key==='Enter'||e.key==='=')calculate();else if(e.key==='Backspace'){e.preventDefault();backspace()}else if(e.key==='Escape')pressAction('clear');else if(['+','-','*','/','.'].includes(e.key))insertText({'*':'×','/':'÷','-':'−','.':','}[e.key]||e.key)});
applyPreferences();save();cleanOld();render();renderHistory();syncSettingsUi();setTimeout(showBackupPrompt,700);if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
