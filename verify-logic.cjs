// Run: node verify-logic.cjs. Isolated model checks; never touches browser data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
function context(page,initial={}){const storage=new Map(Object.entries(initial)),nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:true,open:false,addEventListener(){},close(){this.open=false},showModal(){this.open=true},setAttribute(){},classList:{toggle(){}}});return nodes.get(id)};const c=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},createElement:()=>node('created'),body:{append(){},classList:{toggle(){}}}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{search:'',href:''},history:{replaceState(){}},window:{addEventListener(){}},setTimeout:()=>0,clearTimeout(){},URLSearchParams,console});for(const f of ['data.js',...(page==='events.js'?['event-workflow.js']:[]),page])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),c);return c}
const run=(c,code)=>vm.runInContext(code,c);
// Model migration preserves existing schedules, conditions, names and backup; never snapshots 输出 in new relations.
const migrated=context('relations.js');
assert.equal(run(migrated,'db.relationModel'),'complete-events-v1');
assert.equal(run(migrated,'db.rules.board[0].eventIds.join(",")'),'event-1,event-2');
assert.equal(run(migrated,'"outputs" in db.rules.board[0]'),false);
assert.equal(run(migrated,'db.rules.board[0].scheduleId'),'demo-all');
assert.equal(run(migrated,"!!readSession('iced-before-complete-events',null)"),true);
const source=context('events.js');
run(source,"db.relationModel='old';db.rules.board[0].outputs=[{device:'board',port:4,event:6}];delete db.rules.board[0].eventIds;persist();");
const legacy=run(source,"sessionStorage.getItem('iced-io-prototype-v2')");
const legacyDraft={id:null,name:'旧草稿',scheduleId:'demo-night',inputs:{2:'低电平'},outputs:[{device:'board',port:4,event:6}]};
const compat=context('relations.js',{'iced-io-prototype-v2':legacy,'iced-relation-drafts':JSON.stringify({'board:new':legacyDraft}),'iced-io-navigation':JSON.stringify({device:'board',selected:null,draft:legacyDraft,editorOpen:true})});
assert.equal(run(compat,'draft.eventIds.join()'),'batch-example');
assert.equal(run(compat,'resolvedOutputs(draft).length'),3);
assert.equal(run(compat,'draft.scheduleId'),'demo-night');
assert.equal(run(compat,"readSession('iced-complete-event-migration',{}).expanded"),1);
assert.equal(run(compat,"readSession('iced-before-complete-events',{}).db.rules.board[0].outputs.length"),1);
console.log('PASS: legacy relations/drafts/navigation migrate to complete-event IDs with original-data backup.');

// Event edits affect all existing references without re-saving a relation.
const dynamic=context('events.js');
run(dynamic,"db.rules.board.push({id:80,name:'完整事件关系',scheduleId:'demo-all',inputs:{1:'高电平'},eventIds:['batch-example']});const ruleBefore=JSON.stringify(db.rules.board.find(r=>r.id===80));openEvent('batch-example');eventDraft.targets.push({device:'board',port:6,action:'Delay',delay:14});askEventSave();");
assert.equal(run(dynamic,"$('#impactDialog').open"),true);assert.match(run(dynamic,"$('#impactDialog').innerHTML"),/新增输出/);
assert.equal(run(dynamic,"resolvedOutputs(db.rules.board.find(r=>r.id===80)).length"),3,'no effects before event save');
run(dynamic,'saveEvent();');assert.equal(run(dynamic,"resolvedOutputs(db.rules.board.find(r=>r.id===80)).length"),4);
assert.equal(run(dynamic,'JSON.stringify(db.rules.board.find(r=>r.id===80))'),run(dynamic,'ruleBefore'));
run(dynamic,"openEvent('batch-example');eventDraft.name='完整机房事件';eventDraft.targets=eventDraft.targets.filter(t=>!(t.device==='board'&&t.port===4));");
assert.equal(run(dynamic,'validateEvent()'),'','referenced event may remove a member without deleting event');
run(dynamic,'askEventSave();');assert.match(run(dynamic,"$('#impactDialog').innerHTML"),/移除输出/);run(dynamic,'saveEvent();');
assert.equal(run(dynamic,"resolvedOutputs(db.rules.board.find(r=>r.id===80)).length"),3);
assert.equal(run(dynamic,"groupName('batch-example')"),'完整机房事件');
run(dynamic,"openEvent('batch-example',7);eventDraft.targets[0].action='Latch';saveEvent();");
assert.equal(run(dynamic,"ev(resolvedOutputs(db.rules.board.find(r=>r.id===80)).find(o=>o.port===5).event).action"),'Latch');
run(dynamic,"openEvent('batch-example');eventDraft.targets=[];");assert.match(run(dynamic,'validateEvent()'),/至少选择一个输出/);
run(dynamic,"askDeleteEvents(db.events.filter(e=>e.group==='batch-example').map(e=>e.id));deletePendingEvents();");assert.equal(run(dynamic,"!!groupById('batch-example')"),true,'referenced full event cannot be deleted');
console.log('PASS: addition/removal/name/action changes propagate dynamically; impact previews and whole-event deletion guard.');

// Complete event picker filters events, never picks or truncates their member outputs.
const picker=context('event-picker.js');
run(picker,"eventPicker={selected:new Set(['batch-example']),query:'DEMO-000002',page:1};renderEventPicker();");
assert.equal(run(picker,"matchingCompleteEvents().find(g=>g.id==='batch-example').events.length"),3);
assert.match(run(picker,"$('#completeEventResults').innerHTML"),/查看完整执行内容（3 个输出）/);
assert.equal(run(picker,"$('#completeEventResults').innerHTML.includes('data-op-target')"),false);
run(picker,"eventPicker.query='不存在';renderEventPicker();");assert.equal(run(picker,'eventPicker.selected.size'),1);assert.match(run(picker,"$('#completeEventSelected').innerHTML"),/选择仍保留/);
console.log('PASS: event-only selection, full read-only execution preview, selection retention through search.');

// Relationship save/copy/return use only full event IDs; schedules and multi-输入 remain intact.
const rel=context('relations.js');
run(rel,"openEdit();draft.name='新完整关系';draft.inputs={1:'高电平',2:'低电平'};draft.scheduleId='demo-work';draft.eventIds=['batch-example'];");
assert.equal(run(rel,'validateRule()'),'');run(rel,'save();');assert.equal(run(rel,'selectedRule().eventIds[0]'),'batch-example');assert.equal(run(rel,'"outputs" in selectedRule()'),false);
assert.equal(run(rel,'resolvedOutputs(selectedRule()).length'),3);run(rel,'copyRule(selected);');assert.equal(run(rel,'draft.scheduleId'),'demo-work');assert.equal(run(rel,'Object.keys(draft.inputs).length'),2);
run(rel,"draft.eventIds=['missing'];");assert.match(run(rel,'validateRule()'),/不可用/);
run(rel,"draft.eventIds=[];");assert.match(run(rel,'validateRule()'),/至少选择一个自定义事件/);
run(rel,"draft.eventIds=['event-1','event-5'];");assert.equal(run(rel,'overlappingOutputs(draft).length'),1);assert.equal(run(rel,'validateRule()'),'','shared 输出 warns without inventing priority or blocking rule');
run(rel,"draft.scheduleId='';");assert.match(run(rel,'validateRule()'),/时间表/);
run(rel,"draft.scheduleId='demo-all';draft.inputs={};");assert.match(run(rel,'validateRule()'),/输入/);
const returned=context('relations.js',{'iced-io-navigation':JSON.stringify({device:'board',selected:null,draft:{id:null,name:'回到草稿',scheduleId:'demo-night',inputs:{2:'低电平'},eventIds:['event-1']},editorOpen:true}),'iced-event-result':JSON.stringify({eventIds:['batch-example'],replaceGroup:'event-1'})});
assert.equal(run(returned,'draft.eventIds.join()'),'batch-example');assert.equal(run(returned,'draft.scheduleId'),'demo-night');assert.equal(run(returned,'draft.inputs[2]'),'低电平');
assert.equal(run(returned,'db.rules.board.length'),3,'return does not auto-save relationship');
console.log('PASS: relationship save/copy/validation/new-event return; multi-输入 and schedule drafts preserved.');

// Entire copy, entire reuse, and partial overlap must remain independent.
const copied=context('events.js',{'iced-event-request':JSON.stringify({mode:'copy',sourceGroup:'batch-example',relation:{device:'board',id:1,name:'独立关系'}})});
assert.equal(run(copied,'eventDraft.targets.length'),3);run(copied,"eventDraft.targets[0].action='Latch';saveEvent();");assert.equal(run(copied,"readSession('iced-event-result',{}).replaceGroup"),'batch-example');assert.equal(run(copied,'ev(6).action'),'Momentary');
assert.equal(run(copied,"groupById(readSession('iced-event-result',{}).eventIds[0]).events.length"),3);
const reuse=context('events.js');run(reuse,"const initialCount=db.events.length;openEvent(null);eventDraft.name='同样事件';eventDraft.targets=groupById('batch-example').events.map(savedTarget);askEventSave();");
assert.equal(run(reuse,"$('#eventWorkflowDialog').open"),true);run(reuse,'saveEvent({reuse:true});');assert.equal(run(reuse,'db.events.length'),run(reuse,'initialCount'));
run(reuse,"openEvent(null);eventDraft.name='部分相同但用途独立';eventDraft.targets=[savedTarget(ev(6))];");assert.equal(run(reuse,'duplicateCompleteEvent()'),null);run(reuse,'saveEvent();');assert.equal(run(reuse,'db.events.length'),run(reuse,'initialCount+1'));
console.log('PASS: independent copy contains full event; reuse requires whole-set equality; partial overlap never strips members.');

// Existing draft reconciliation and timing constraints remain.
const drafts=context('events.js');run(drafts,"openEvent('batch-example');eventDraft.targets.find(t=>t.port===5).action='Latch';openEvent('batch-example',6);eventDraft.targets[0].action='Delay';eventDraft.targets[0].delay=11;saveEvent();openEvent('batch-example');");
assert.equal(run(drafts,"eventDraft.targets.find(t=>t.port===5).action"),'Latch');assert.equal(run(drafts,"eventDraft.targets.find(t=>t.port===4).delay"),11);run(drafts,'saveEvent();');
run(drafts,"eventDraft.targets.find(t=>t.port===4).delay=22;openEvent('batch-example',6);eventDraft.targets[0].delay=33;saveEvent();openEvent('batch-example');");assert.equal(run(drafts,'eventDraft.conflicts.length'),1);assert.match(run(drafts,'validateEvent()'),/差异/);run(drafts,"resolveEventConflict(0,'saved');");assert.equal(run(drafts,"eventDraft.targets.find(t=>t.port===4).delay"),33);
for(const action of ['Momentary','Mimic','Latch','Delay']){
 run(drafts,`openEvent('batch-example',6);eventDraft.targets[0].action='${action}';eventDraft.targets[0].delay=5;`);
 for(const value of [-1,1.5,null,256]){run(drafts,`eventDraft.targets[0].duration=${value};`);assert.match(run(drafts,'validateEvent()'),/启动延迟/)}
 for(const value of [0,255]){run(drafts,`eventDraft.targets[0].duration=${value};`);assert.equal(run(drafts,'validateEvent()'),'')}
 run(drafts,'eventDraft.targets[0].duration=0;');
 assert.match(run(drafts,'eventEditor()'),/min="0" max="255"/);
 assert.match(run(drafts,'eventEditor()'),/data-time-key="duration"/);
 assert.equal(run(drafts,`actionFields(eventDraft.targets[0],0).includes('data-time-key="delay"')`),action==='Delay');
}
for(const value of [0,256,-1,1.5,null]){run(drafts,`eventDraft.targets[0].delay=${value};`);assert.match(run(drafts,'validateEvent()'),/1～255/)}
console.log('PASS: draft merge/conflicts, unchanged action timing boundaries, schedule-only draft protection.');
const boundaries=context('relations.js');run(boundaries,"openEdit();draft.name='边界';draft.scheduleId='demo-all';draft.inputs={1:'高电平'};draft.eventIds=['event-1'];db.rules.board=Array.from({length:20},(_,i)=>({id:i+1,name:'R'+i,scheduleId:'demo-all',inputs:{1:'高电平'},eventIds:['event-1']}));");assert.match(run(boundaries,'validateRule()'),/20/);
const cleanup=context('events.js');run(cleanup,"sessionStorage.setItem('iced-relation-drafts',JSON.stringify({'board:new':{name:'暂存',scheduleId:'demo-all',inputs:{1:'高电平'},eventIds:['batch-example']}}));askDeleteEvents([6,7,8]);deletePendingEvents();");assert.equal(run(cleanup,"groupById('batch-example').events.length"),3);run(cleanup,"sessionStorage.removeItem('iced-relation-drafts');askDeleteEvents([6,7,8]);deletePendingEvents();");assert.equal(run(cleanup,"groupById('batch-example')"),undefined);run(cleanup,'undoEventDeletion();');assert.equal(run(cleanup,"groupById('batch-example').events.length"),3);
const prep=context('relations.js',{'iced-new-relation-events':JSON.stringify({source:'builtin',eventIds:['batch-example']})});assert.equal(run(prep,'device'),'builtin');assert.equal(run(prep,'draft.eventIds.join()'),'batch-example');assert.equal(run(prep,'Object.keys(draft.inputs).length'),0);
run(dynamic,"openEvent('batch-example',7);");assert.match(run(dynamic,'eventChangeSummary()'),/输出6/,'single-输出 impact preview includes other event members');
console.log('PASS: existing 20-rule limit, relation-draft reference protection, delete/undo, complete-event prepared handoff, full impact preview.');

// Review fixes: relation-specific new-event drafts, including isolated fresh relation tasks.
const a=context('events.js',{'iced-event-request':JSON.stringify({mode:'new',origin:'Default/board/id-1',relation:{device:'board',id:1,name:'关系 A'}})});
run(a,"eventDraft.name='关系 A 专用';eventDraft.targets=[{device:'board',port:9,action:'Latch'}];keepEventDraft();");
const draftStorage=run(a,"sessionStorage.getItem('iced-event-drafts')");
const b=context('events.js',{'iced-event-drafts':draftStorage,'iced-event-request':JSON.stringify({mode:'new',origin:'Default/board/id-2',relation:{device:'board',id:2,name:'关系 B'}})});
assert.equal(run(b,'eventDraft.name'),'');assert.equal(run(b,'eventDraft.targets.length'),0);
const resumeA=context('events.js',{'iced-event-drafts':draftStorage,'iced-event-request':JSON.stringify({mode:'new',origin:'Default/board/id-1',relation:{device:'board',id:1,name:'关系 A'}})});
assert.equal(run(resumeA,'eventDraft.name'),'关系 A 专用');assert.equal(run(resumeA,'eventDraft.targets[0].port'),9);
const wrongReturn=context('relations.js',{'iced-io-navigation':JSON.stringify({device:'board',selected:2,draft:{id:2,name:'关系 B',scheduleId:'demo-work',inputs:{3:'高电平'},eventIds:['event-2']},editorOpen:true}),'iced-event-result':JSON.stringify({origin:'Default/board/id-1',eventIds:['batch-example']})});
assert.equal(run(wrongReturn,'draft.eventIds.join()'),'event-2');assert.match(run(wrongReturn,'error'),/另一条关系/);
const newTasks=context('relations.js');run(newTasks,"openEdit();eventRequest('new');const firstTask=readSession('iced-event-request',{}).origin;draft={id:null,name:'',scheduleId:'',inputs:{},eventIds:[]};eventRequest('new');");assert.notEqual(run(newTasks,"readSession('iced-event-request',{}).origin"),run(newTasks,'firstTask'));
console.log('PASS: cross-relation drafts isolated, same-source drafts restored, new tasks distinct, mismatched returns never attached.');

// Shared-event member removal and restore both disclose effects; keep whole-event protection.
const removal=context('events.js');run(removal,"db.rules.board.push({id:81,name:'已引用机房事件',scheduleId:'demo-all',inputs:{1:'高电平'},eventIds:['batch-example']});openEvent('batch-example',6);askDeleteEvents([6]);");
assert.match(run(removal,"$('#eventWorkflowDialog').innerHTML"),/确认移除此输出/);assert.match(run(removal,"$('#eventWorkflowDialog').innerHTML"),/已引用机房事件/);
run(removal,'deletePendingEvents();');assert.equal(run(removal,"groupById('batch-example').events.length"),2);assert.equal(run(removal,"db.rules.board.find(r=>r.id===81).eventIds[0]"),'batch-example');
run(removal,'undoEventDeletion();');assert.equal(run(removal,"groupById('batch-example').events.length"),2,'no restoration before confirmation');assert.match(run(removal,"$('#eventWorkflowDialog').innerHTML"),/确认恢复输出/);
run(removal,'undoEventDeletion(true);');assert.equal(run(removal,"groupById('batch-example').events.length"),3);
run(removal,"askDeleteEvents([1],false);");assert.match(run(removal,"$('#eventWorkflowDialog').innerHTML"),/至少需要保留一个输出/);
const lateRef=context('events.js');run(lateRef,"askDeleteEvents([6]);deletePendingEvents();db.rules.board.push({id:82,name:'删除后才引用',scheduleId:'demo-all',inputs:{1:'高电平'},eventIds:['batch-example']});undoEventDeletion();");assert.equal(run(lateRef,"groupById('batch-example').events.length"),2);assert.match(run(lateRef,"$('#eventWorkflowDialog').innerHTML"),/删除后才引用/);
run(lateRef,"db.events.push({...deletedEvents.events[0],id:900,action:'Latch'});undoEventDeletion(true);");assert.match(run(lateRef,"$('#eventWorkflowDialog').innerHTML"),/不会覆盖新配置/);assert.equal(run(lateRef,"groupById('batch-example').events.length"),3);
console.log('PASS: referenced member removal preserves event reference; final 输出 protected; undo rechecks new references and duplicate targets.');

// Change review exposes exact actions/times and other relations without imposing arbitration.
const impact=context('events.js');run(impact,"openEvent('event-2');eventDraft.targets[0].delay=12;eventDraft.targets.push({device:'board',port:1,action:'Latch'});askEventSave();");
const impactHtml=run(impact,"$('#impactDialog').innerHTML");
for(const pattern of [/修改前/,/修改后/,/5 秒/,/12 秒/,/本关系的事件包含/,/Momentary/,/Latch/,/另有/,/通风设备联动/])assert.match(impactHtml,pattern);
const shared=context('relations.js');run(shared,'openEdit(2);');assert.match(run(shared,'editor()'),/另有 1 条已保存关系控制相同输出/);
console.log('PASS: exact parameter changes, overlapping event actions and cross-relation controls visible; last-trigger semantics retained.');

// An explicit copy remains independent even when unchanged; same names are warned, not banned.
const explicitCopy=context('events.js',{'iced-event-request':JSON.stringify({mode:'copy',sourceGroup:'batch-example',origin:'Default/board/id-1',relation:{device:'board',id:1,name:'独立关系'}})});
run(explicitCopy,'askEventSave();');assert.equal(run(explicitCopy,"$('#eventWorkflowDialog').open"),false);
assert.notEqual(run(explicitCopy,"readSession('iced-event-result',{}).eventIds[0]"),'batch-example');assert.equal(run(explicitCopy,"readSession('iced-event-result',{}).origin"),'Default/board/id-1');
run(explicitCopy,"request=null;openEvent(null);eventDraft.name='声光报警输出';eventDraft.targets=[{device:'board',port:12,action:'Latch'}];askEventSave();");
assert.match(run(explicitCopy,"$('#eventWorkflowDialog').innerHTML"),/确认保留同名事件/);assert.equal(run(explicitCopy,'validateEvent()'),'');
run(explicitCopy,"eventSaveOptions.allowSameName=true;askEventSave(true);");assert.equal(run(explicitCopy,"eventGroups().filter(g=>g.name==='声光报警输出').length"),2);
assert.equal(run(explicitCopy,"uniqueCopyName('机房报警提示')"),'机房报警提示（副本 2）');
console.log('PASS: unchanged independent copies remain independent, unique copy names, same-name confirmation without new uniqueness rule.');

// Editing from a relation saves shared definition and returns without changing relationship choices.
const editReturn=context('events.js',{'iced-event-request':JSON.stringify({mode:'edit',sourceGroup:'event-2',origin:'Default/board/id-2',relation:{device:'board',id:2,name:'通风关系'}})});
assert.equal(run(editReturn,'eventMode'),'group');assert.match(run(editReturn,'eventEditor()'),/保存并返回原关系/);
run(editReturn,'eventDraft.targets[0].delay=15;askEventSave();saveEvent();');assert.equal(run(editReturn,'ev(2).delay'),15);
assert.equal(run(editReturn,"readSession('iced-event-result',{}).eventIds.length"),0);assert.equal(run(editReturn,"readSession('iced-event-result',{}).origin"),'Default/board/id-2');
const noChange=context('events.js',{'iced-event-request':JSON.stringify({mode:'edit',sourceGroup:'event-2',origin:'Default/board/id-2',relation:{device:'board',id:2}})});run(noChange,'askEventSave();');assert.equal(run(noChange,'location.href'),'index.html?layout=A');
const searchOut=context('events.js');run(searchOut,"openEvent('batch-example');eventOutputQuery='DEMO-000002 输出2';");assert.match(run(searchOut,'outputActionCards()'),/显示 1 \/ 3/);assert.match(run(searchOut,'outputActionCards()'),/data-target-action="2"/);
run(searchOut,"eventDraft.targets[2].action='Latch';eventOutputQuery='not-found';");assert.match(run(searchOut,'outputActionCards()'),/没有匹配/);assert.equal(run(searchOut,'eventDraft.targets.length'),3);run(searchOut,'saveEvent();');assert.equal(run(searchOut,"groupById('batch-example').events.length"),3);assert.equal(run(searchOut,'ev(8).action'),'Latch');
console.log('PASS: shared event save-and-return (including unchanged), 输出 search keeps full contents and original edit indices.');

// Copy on the event page creates a complete independent event, never a relationship.
const localCopy=context('events.js');
run(localCopy,"openEvent('batch-example',6);const beforeRules=JSON.stringify(db.rules);const beforeSource=JSON.stringify(groupById('batch-example'));copyCurrentEvent();");
assert.equal(run(localCopy,'eventDraft.targets.length'),3);
assert.equal(run(localCopy,'saveReturnEnabled()'),false);
assert.equal(run(localCopy,'saveButtonText()'),'保存');
const pendingCopy=run(localCopy,"sessionStorage.getItem('iced-event-request')"),pendingDrafts=run(localCopy,"sessionStorage.getItem('iced-event-drafts')");
const refreshedCopy=context('events.js',{'iced-event-request':pendingCopy,'iced-event-drafts':pendingDrafts});
assert.equal(run(refreshedCopy,'eventMode'),'copy');assert.equal(run(refreshedCopy,'eventDraft.targets.length'),3);
run(localCopy,'askEventSave();');
assert.equal(run(localCopy,'location.href'),'');assert.equal(run(localCopy,"readSession('iced-event-result',null)"),null);
assert.equal(run(localCopy,"readSession('iced-event-request',null)"),null);
assert.equal(run(localCopy,'JSON.stringify(db.rules)'),run(localCopy,'beforeRules'));
assert.equal(run(localCopy,"JSON.stringify(groupById('batch-example'))"),run(localCopy,'beforeSource'));
assert.equal(run(localCopy,'groupById(eventScope).events.length'),3);assert.notEqual(run(localCopy,'eventScope'),'batch-example');
run(localCopy,"openEvent('batch-example');eventDraft.targets[0].action='Latch';copyCurrentEvent();");assert.equal(run(localCopy,'eventMode'),'group');assert.match(run(localCopy,'eventError'),/先保存或取消/);
console.log('PASS: standalone complete-event copy, refresh recovery, independent save, unchanged references and unsaved-edit guard.');

// Drawer lifecycle keeps unsaved work separate from cancel and saved event data.
const drawer=context('events.js');
assert.equal(run(drawer,"$('#eventEditDialog').open"),false,'ordinary entry shows the list');
run(drawer,"openEvent('batch-example');eventDraft.name='待继续的事件';keepEventDraft();closeEventEditor();");
assert.equal(run(drawer,"$('#eventEditDialog').open"),false);
assert.equal(run(drawer,"groupName('batch-example')"),'机房报警提示');
run(drawer,"resumeEventDraft('group:batch-example');");
assert.equal(run(drawer,"$('#eventEditDialog').open"),true);
assert.equal(run(drawer,'eventDraft.name'),'待继续的事件');
const drawerState=run(drawer,"Object.fromEntries(['iced-event-drafts','iced-event-editor'].map(k=>[k,sessionStorage.getItem(k)]))");
const reloadDrawer=context('events.js',drawerState);
assert.equal(run(reloadDrawer,"$('#eventEditDialog').open"),true);
assert.equal(run(reloadDrawer,'eventDraft.name'),'待继续的事件');
run(drawer,'discardEventEdit();');
assert.equal(run(drawer,"$('#eventEditDialog').open"),false);
assert.equal(run(drawer,"!!eventDrafts['group:batch-example']"),false);
run(drawer,"openEvent(null);askEventSave();");
assert.equal(run(drawer,"$('#eventEditDialog').open"),true,'invalid save leaves editor open');
run(drawer,"eventDraft.name='侧栏新增检查';eventDraft.targets=[{device:'board',port:16,action:'Latch'}];saveEvent();");
assert.equal(run(drawer,"$('#eventEditDialog').open"),false);
assert.equal(run(drawer,"eventGroups().filter(g=>g.name==='侧栏新增检查').length"),1);
run(drawer,"openEvent('event-2');eventDraft.targets[0].delay=22;askEventSave();");
assert.equal(run(drawer,"$('#impactDialog').open && $('#eventEditDialog').open"),true);
assert.equal(run(drawer,'ev(2).delay'),5,'impact confirmation precedes saving');
run(drawer,'saveEvent();');assert.equal(run(drawer,'ev(2).delay'),22);
assert.equal(run(drawer,"$('#eventEditDialog').open"),false);
console.log('PASS: drawer entry, close/resume/refresh, cancel, validation, successful save and nested impact confirmation.');

// Common startup delay applies to every mode; Delay holds output after startup.
const timing=context('events.js');
for(const action of ['Momentary','Mimic','Latch','Delay']){
 run(timing,`openEvent(null);reconcileEventTargets([{device:'board',port:9}]);eventDraft.name='时序-${action}';eventDraft.targets[0].action='${action}';eventDraft.targets[0].delay=5;`);
 assert.equal(run(timing,'eventDraft.targets[0].duration'),0);
 run(timing,'eventDraft.targets[0].duration=3;saveEvent();');
 assert.equal(run(timing,'eventDraft.targets[0].duration'),3);
 assert.equal(run(timing,'validateEvent()'),'');
}
assert.match(run(timing,"timeText({action:'Momentary',duration:0})"),/立即启动.*100ms/);
assert.match(run(timing,"timeText({action:'Delay',duration:3,delay:5})"),/启动延迟 3 秒.*持续 5 秒后停止/);
assert.match(run(timing,"ACTION_INFO.Delay.description"),/N 从实际开始输出时计时/);
assert.match(run(timing,"timeText({action:'Mimic',duration:3})"),/到期不执行输出/);
assert.match(run(timing,"ACTION_INFO.Mimic.description"),/延迟到期后不执行输出/);
assert.match(run(timing,"timeText({action:'Latch',duration:256})"),/待填写/);
for(const delay of [1,255])assert.equal(run(timing,`actionTimeError({action:'Delay',duration:255,delay:${delay}})`),'');
run(timing,"openEvent('batch-example');eventDraft.duration=3;eventDraft.action='Delay';eventDraft.delay=5;applyBulkActions();saveEvent();copyCurrentEvent();");
assert.equal(run(timing,'eventDraft.targets.every(t=>t.duration===3&&t.delay===5)'),true);
// Different common delays prevent incorrect whole-event deduplication.
run(timing,"request=null;eventDraft=null;openEvent(null);eventDraft.name='不同时序';eventDraft.targets=groupById('batch-example').events.map(savedTarget);eventDraft.targets[0].duration=4;");
assert.equal(run(timing,'duplicateCompleteEvent()'),null);
const oldTiming=run(timing,"const legacyTimes=clone(db);delete legacyTimes.timingModel;legacyTimes.events.find(e=>e.id===2).delay=7;legacyTimes.events.find(e=>e.id===2).duration=null;legacyTimes.events.find(e=>e.id===3).duration=6;JSON.stringify(legacyTimes)");
const oldEventDraft={name:'通风设备联动',action:'Delay',duration:null,delay:7,targets:[{device:'board',port:2,action:'Delay',duration:null,delay:7}],memberIds:[2],base:{name:'通风设备联动',memberIds:[2],targets:[{device:'board',port:2,action:'Delay',duration:null,delay:7}]}};
const converted=context('events.js',{'iced-io-prototype-v2':oldTiming,'iced-event-drafts':JSON.stringify({'group:event-2':oldEventDraft})});
assert.equal(run(converted,'ev(2).duration'),7);assert.equal(run(converted,'ev(2).delay'),null);
assert.equal(run(converted,'ev(3).duration'),null,'old stop delay cannot become a startup delay');
assert.equal(run(converted,"readSession('iced-before-startup-duration-v2',{}).db.events.find(e=>e.id===3).duration"),6);
assert.equal(run(converted,"eventDrafts['group:event-2'].targets[0].duration"),7);
assert.equal(run(converted,"eventDraftDirty(eventDrafts['group:event-2'])"),false,'base and draft migrate together');
run(converted,"openEvent('event-2');eventDraft.targets[0].delay=5;saveEvent();");
const newTiming=run(converted,"sessionStorage.getItem('iced-io-prototype-v2')");
const convertedAgain=context('events.js',{'iced-io-prototype-v2':newTiming});
assert.equal(run(convertedAgain,'ev(2).duration'),7);assert.equal(run(convertedAgain,'ev(2).delay'),5);
console.log('PASS: all-mode startup delay/default zero, 100ms pulse, Delay hold, bulk/copy/dedup and one-time legacy timing migration.');
