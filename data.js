const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=r=>JSON.parse(JSON.stringify(r));
const devices=[{id:'board',name:'I/O 扩展板 · IO-01',short:'IO-01',ports:16,outs:16,meta:'测试墙 / 地址 1 · 16 输入 / 16 输出'},{id:'builtin',name:'控制器 · 测试墙',short:'测试墙',ports:3,outs:2,meta:'测试墙 · 3 输入 / 2 输出'},{id:'empty',name:'I/O 扩展板 · IO-02',short:'IO-02',ports:16,outs:16,meta:'测试墙 / 地址 2 · 16 输入 / 16 输出'}];
// 1000 台仅用于选择器评审的虚拟设备，非真实站点清单。
devices.forEach((d,i)=>{d.kind=d.id==='builtin'?'builtin':'board';d.controller='测试墙';d.code='DEMO-'+String(i+1).padStart(6,'0');d.path=d.kind==='builtin'?'Default / '+d.short:'Default / 测试墙 / '+d.short});
for(let n=4;n<=1000;n++){const builtin=n%5===0,group=Math.ceil((n-3)/20),controller='控制器-'+String(group).padStart(3,'0'),short=builtin?controller:'IO-'+String((n-4)%4+1).padStart(2,'0');devices.push({id:'demo-'+n,name:(builtin?'控制器 · ':'I/O 扩展板 · ')+short,short,kind:builtin?'builtin':'board',controller,code:'DEMO-'+String(n).padStart(6,'0'),path:builtin?'Default / '+short:'Default / '+controller+' / '+short,ports:builtin?3:16,outs:builtin?2:16,meta:controller+' · '+(builtin?'3 输入 / 2 输出':'16 输入 / 16 输出')})}
// 仅用于预览选择已有时间表的交互，不代表真实点位的时间表清单或默认值。
const schedules=[
 {id:'demo-all',name:'全天',summary:'每天 · 00:00–24:00'},
 {id:'demo-work',name:'工作日办公时间',summary:'周一至周五 · 09:00–18:00'},
 {id:'demo-night',name:'夜间值守',summary:'每天 · 18:00–次日 08:00'}
];
const scheduleById=id=>schedules.find(s=>s.id===id);
const scheduleName=r=>scheduleById(r.scheduleId)?.name||(r.scheduleId?'时间表不可用':'待选择时间表');
const scheduleSummary=r=>scheduleById(r.scheduleId)?.summary||(r.scheduleId?'请重新选择有效时间表':'请为本关系选择时间表');
const ACTIONS=['Momentary','Mimic','Latch','Delay'];
const ACTION_INFO={
  Momentary:{name:'点动模式',description:'等待启动延迟后，输出 100ms，然后停止。'},
  Mimic:{name:'联动模式',description:'等待启动延迟后，跟随输入信号控制输出。等待期间输入信号消失，延迟到期后不执行输出。'},
  Latch:{name:'始终模式',description:'等待启动延迟后，输出保持打开，直到在软件中人工关闭。'},
  Delay:{name:'延时模式',description:'等待启动延迟后开始输出，持续 N 秒后停止。N 从实际开始输出时计时。'}
};
const actionLabel=a=>ACTION_INFO[a]?a+' · '+ACTION_INFO[a].name:(a||'');
function actionTimeError(e){
 if(!e)return '事件不可用。';
 const duration=e.duration===undefined?0:e.duration;
 if(!Number.isSafeInteger(duration)||duration<0||duration>255)return '启动延迟（Duration）须为 0～255 秒的整数。';
 if(e.action==='Delay'&&(!Number.isInteger(e.delay)||e.delay<1||e.delay>255))return '输出持续时间（N）须为 1～255 秒的整数。';
 return '';
}
function actionTiming(e){return {duration:e.duration===undefined?0:e.duration,delay:e.action==='Delay'?e.delay:null}}
const seed={timingModel:'startup-duration-v2',events:[{id:1,name:'声光报警输出',device:'board',port:1,action:'Momentary',duration:0,delay:null},{id:2,name:'通风设备联动',device:'board',port:2,action:'Delay',duration:3,delay:5},{id:3,name:'值班室提示',device:'board',port:3,action:'Mimic',duration:0,delay:null},{id:4,name:'控制器报警输出',device:'builtin',port:1,action:'Latch',duration:0,delay:null},{id:5,name:'备用报警提示',device:'board',port:1,action:'Delay',duration:0,delay:2}],rules:{board:[{id:1,inputs:{1:'高电平',2:'低电平'},outputs:[{device:'board',port:1,event:1},{device:'board',port:2,event:2}]},{id:2,inputs:{3:'高电平'},outputs:[{device:'board',port:2,event:2}]},{id:3,inputs:{4:'低电平'},outputs:[{device:'board',port:3,event:3}]}],builtin:[{id:4,inputs:{1:'高电平',2:'低电平'},outputs:[{device:'builtin',port:1,event:4}]}],empty:[]}};
// 初始示例明确属于同一批量配置组；已有会话不自动归并。
seed.events.push(...[{device:'board',port:4},{device:'board',port:5},{device:'builtin',port:2}].map((o,i)=>({id:6+i,group:'batch-example',name:'机房报警提示',action:'Momentary',duration:0,delay:null,...o})));
for(const e of seed.events)Object.assign(e,actionTiming(e));
for(const r of Object.values(seed.rules).flat())r.scheduleId=r.id===2?'demo-work':r.id===3?'demo-night':'demo-all';
let db;try{db=JSON.parse(sessionStorage.getItem('iced-io-prototype-v2'))||clone(seed)}catch{db=clone(seed)}
// 兼容先前仅有“触发输出”的本机示例，保留已编辑的名称、目标和时间。
let migratedActions=false;
for(const e of db.events){if(!ACTIONS.includes(e.action)){e.action=e.delay>0?'Delay':'Momentary';migratedActions=true}}
if(migratedActions)sessionStorage.setItem('iced-io-prototype-v2',JSON.stringify(db));
// 旧示例使用了不同的时间含义。保留原始数据，不能将停止延迟静默改为启动延迟。
if(db.timingModel!=='startup-duration-v2'){
 const keys=['iced-event-drafts','iced-deleted-events','iced-event-request'];
 const backup={db:clone(db),...Object.fromEntries(keys.map(key=>[key,readSession(key,null)]))};
 sessionStorage.setItem('iced-before-startup-duration-v2',JSON.stringify(backup));
 function convertOldTiming(value,inherited=null){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(item=>convertOldTiming(item,inherited));return}
  const old=ACTIONS.includes(value.action)?{action:value.action,duration:value.duration,delay:value.delay}:inherited;
  for(const [key,child] of Object.entries(value))if(child&&typeof child==='object')convertOldTiming(child,key==='targets'?old:null);
  if(ACTIONS.includes(value.action)||(old&&value.device&&value.port)){
   value.action=old.action;
   value.duration=old.action==='Delay'?(old.delay??null):old.action==='Mimic'?null:0;
   value.delay=null;
  }
 }
 db.events.forEach(e=>convertOldTiming(e));
 for(const key of keys){const value=backup[key];if(value){convertOldTiming(value);sessionStorage.setItem(key,JSON.stringify(value))}}
 db.timingModel='startup-duration-v2';persist();
}
function timingReviewNotice(){const pending=db.events.filter(e=>actionTimeError(e)).length;return pending?`<div class="context-note" role="status">${pending} 个输出的时间参数待核对。Duration 现为启动延迟；Delay 模式另设输出持续时间。旧演示时间无法直接对应的参数已留空，请编辑事件补全。</div>`:''}
function timeText(e){
 if(!e)return '';
 const duration=e.duration===undefined?0:e.duration;
 const start=Number.isSafeInteger(duration)&&duration>=0&&duration<=255?(duration===0?'立即启动':`启动延迟 ${duration} 秒`):'启动延迟待填写';
 if(e.action==='Momentary')return `${start} · 输出 100ms 后停止`;
 if(e.action==='Latch')return `${start} · 保持打开，直至人工关闭`;
 if(e.action==='Mimic')return `${start} · 跟随输入信号；等待期间信号消失，到期不执行输出`;
 if(e.action==='Delay')return `${start} · ${Number.isInteger(e.delay)&&e.delay>=1&&e.delay<=255?`输出持续 ${e.delay} 秒后停止`:'输出持续时间待填写'}`;
 return '';
}
const dev=id=>devices.find(d=>d.id===id);const ev=id=>db.events.find(e=>e.id===Number(id));
function persist(){sessionStorage.setItem('iced-io-prototype-v2',JSON.stringify(db))}
function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').hidden=true,2800)}
function candidates(o){return db.events.filter(e=>e.device===o.device&&e.port===Number(o.port))}
function eventLink(id,text='查看事件 ↗'){return `<a class="link" data-events href="events.html${id?'?event='+id:''}">${text}</a>`}
function summary(o){const e=ev(o.event);return e?`${esc(actionLabel(e.action))}<span>${timeText(e)}</span>`:'选择事件后显示动作与时间';}
function tags(inputs){return Object.entries(inputs).map(([p,v])=>`<span class="tag">输入${p} · ${v}</span>`).join('<span class="and">AND</span>')}

// 批量组是明确的创建关系，不按相同名称自动合并旧记录。
for(const e of db.events)if(!e.group)e.group='event-'+e.id;
// 组名独立保存；单个输出的动作编辑不再改变名称。
db.eventNames ||= {};
for(const e of [...db.events].sort((a,b)=>a.id-b.id))if(!db.eventNames[e.group])db.eventNames[e.group]=e.name;
for(const e of db.events)e.name=db.eventNames[e.group];
const groupName=id=>db.eventNames[id]||db.events.find(e=>e.group===id)?.name||'';
function hasRelationDraft(d){return !!d&&(!!d.name||!!d.scheduleId||Object.keys(d.inputs||{}).length>0||(d.eventIds||[]).length>0||(d.outputs||[]).length>0)}

for(const r of Object.values(db.rules).flat())if(!r.name)r.name=({1:'机房报警联动',2:'通风设备联动',3:'值班室提示',4:'控制器报警联动'})[r.id]||'I/O 关系 '+r.id;
const targetKey=o=>o.device+':'+o.port;
const deviceTypeLabel=d=>d.kind==='builtin'?'控制器':'I/O 扩展板';
const deviceLabel=d=>d.kind==='builtin'?'控制器 · '+d.short:d.controller+' / '+d.short;
const targetLabel=o=>`${deviceLabel(dev(o.device))} / 输出${o.port}`;
function groupReferences(groupIds){return Object.entries(db.rules).flatMap(([device,rows])=>rows.filter(r=>ruleEventIds(r).some(id=>groupIds.includes(id))).map(r=>({device,...r})));}
function references(ids){return groupReferences([...new Set(ids.map(ev).filter(Boolean).map(e=>e.group))]);}
function eventGroups(){const groups=new Map();for(const e of db.events){if(!groups.has(e.group))groups.set(e.group,[]);groups.get(e.group).push(e)}return [...groups.entries()].map(([id,events])=>({id,events,...Object.fromEntries(['name','action','duration','delay'].map(k=>[k,events[0][k]]))}));}
function readSession(key,fallback){try{return JSON.parse(sessionStorage.getItem(key))??fallback}catch{return fallback}}

function groupActionText(g){const actions=[...new Set(g.events.map(e=>e.action))];return actions.length===1?actionLabel(actions[0]):'多种动作 · 按输出配置'}
function groupTimeText(g){const configs=new Set(g.events.map(e=>JSON.stringify({action:e.action,...actionTiming(e)})));return configs.size===1?timeText(g.events[0]):'各输出使用各自的动作和时间'}

// 关系只保存完整事件 ID；输出清单始终从当前事件定义读取。
function groupById(id){return eventGroups().find(g=>g.id===id)}
function ruleEventIds(r){return r?.eventIds||[...new Set((r?.outputs||[]).map(o=>ev(o.event)?.group||'missing-event-'+o.event))]}
function migrateRule(r){if(!r)return r;r.eventIds=[...new Set(ruleEventIds(r))];delete r.outputs;return r}
function resolvedOutputs(r){return ruleEventIds(r).flatMap(id=>(groupById(id)?.events||[]).map(e=>({device:e.device,port:e.port,event:e.id,eventGroup:id})))}
function groupLink(id,label){if(!groupById(id))return '<span class="error">事件不可用</span>';return `<a class="link" data-events href="events.html?group=${encodeURIComponent(id)}">${esc(label||groupName(id)||'事件不可用')}</a>`}
function executionList(g){return g?`<div class="event-execution-list">${g.events.map(e=>`<div><strong>${esc(targetLabel(e))}</strong><small>${esc(dev(e.device).code)} · ${esc(actionLabel(e.action))} · ${esc(timeText(e))}</small></div>`).join('')}</div>`:'<p class="error">事件不可用，请重新选择。</p>'}
function overlappingOutputs(r){const seen=new Map();for(const o of resolvedOutputs(r)){const key=targetKey(o);if(!seen.has(key))seen.set(key,[]);seen.get(key).push(o)}return [...seen.values()].filter(items=>items.length>1)}
if(db.relationModel!=='complete-events-v1'){
 const backup={db:clone(db)};for(const key of ['iced-relation-drafts','iced-io-navigation','iced-event-request','iced-event-result','iced-new-relation-outputs'])backup[key]=readSession(key,null);
 sessionStorage.setItem('iced-before-complete-events',JSON.stringify(backup));
 let expanded=0;
 for(const r of Object.values(db.rules).flat()){const legacy=Array.isArray(r.outputs),before=(r.outputs||[]).length;migrateRule(r);if(legacy&&resolvedOutputs(r).length>before)expanded++}
 const drafts=readSession('iced-relation-drafts',{});for(const d of Object.values(drafts))migrateRule(d);sessionStorage.setItem('iced-relation-drafts',JSON.stringify(drafts));
 const nav=readSession('iced-io-navigation',null);if(nav){migrateRule(nav.draft);sessionStorage.setItem('iced-io-navigation',JSON.stringify(nav))}
 const prepared=readSession('iced-new-relation-outputs',null);if(prepared){migrateRule(prepared);sessionStorage.setItem('iced-new-relation-events',JSON.stringify(prepared));sessionStorage.removeItem('iced-new-relation-outputs')}
 const result=readSession('iced-event-result',null);if(Array.isArray(result))sessionStorage.setItem('iced-event-result',JSON.stringify({eventIds:ruleEventIds({outputs:result})}));
 const request=readSession('iced-event-request',null);if(request?.mode==='copy'&&!request.sourceGroup){request.sourceGroup=ev(request.sourceEvent)?.group;sessionStorage.setItem('iced-event-request',JSON.stringify(request))}
 sessionStorage.removeItem('iced-reused-outputs');
 if(expanded)sessionStorage.setItem('iced-complete-event-migration',JSON.stringify({expanded}));
 db.relationModel='complete-events-v1';persist();
}


// 来源标识只用于原型跨页草稿，不参与设备执行。
function relationOrigin(source,r){return ['Default',source,r.id?'id-'+r.id:'draft-'+(r._eventContext||'legacy')].join('/')}
function eventControlOutputs(r,overrides={}){return ruleEventIds(r).flatMap(id=>(overrides[id]||groupById(id)?.events||[]).map(e=>({...e,eventGroup:id})))}
function outputControlNotice(r,source,overrides={},focusKeys=null){
 const outputs=eventControlOutputs(r,overrides).filter(o=>!focusKeys||focusKeys.has(targetKey(o))),byTarget=new Map();
 for(const o of outputs){const key=targetKey(o);if(!byTarget.has(key))byTarget.set(key,[]);byTarget.get(key).push(o)}
 const repeated=[...byTarget.values()].filter(items=>items.length>1);
 const describe=o=>`${esc(groupName(o.eventGroup))}：${esc(actionLabel(o.action))} · ${esc(timeText(o))}`;
 const shared=Object.entries(db.rules).flatMap(([device,rows])=>rows.filter(other=>!(device===source&&other.id===r.id)).map(other=>({device,rule:other,outputs:eventControlOutputs(other,overrides).filter(o=>byTarget.has(targetKey(o)))}))).filter(x=>x.outputs.length);
 if(!repeated.length&&!shared.length)return '';
 return `<div class="scope-hint output-control-notice">${repeated.length?`<strong>本关系的事件包含 ${repeated.length} 个相同输出，请核对动作。</strong>${repeated.map(items=>`<p><b>${esc(targetLabel(items[0]))}</b><br>${items.map(describe).join('<br>')}</p>`).join('')}`:''}${shared.length?`<details><summary>另有 ${shared.length} 条已保存关系控制相同输出 · 查看</summary>${shared.map(x=>`<p><b>${esc(deviceLabel(dev(x.device)))} / ${esc(x.rule.name)}</b> · ${esc(scheduleName(x.rule))}<br>${x.outputs.map(o=>esc(targetLabel(o))+' · '+describe(o)).join('<br>')}</p>`).join('')}</details>`:''}<small>输出按最后收到的触发生效，无优先级。这里只提示共同控制，不判定时间表是否同时有效，也不代表列表顺序就是执行顺序。</small></div>`;
}

