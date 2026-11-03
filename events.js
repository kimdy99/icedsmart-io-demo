let eventView='group';
let eventQuery='',eventDeviceFilter='',eventActionFilter='',eventError='';
let eventEditorOpen=false;
let eventDraft=null,eventMode='group',eventScope=null,eventSelected=null,eventOutputQuery='';
const eventDrafts=readSession('iced-event-drafts',{});
let request=readSession('iced-event-request',null);
let returnPath=sessionStorage.getItem('iced-io-return')||'index.html?layout=A';
if(!/^index\.html\?layout=[ABCD]$/.test(returnPath))returnPath='index.html?layout=A';
if(new URLSearchParams(location.search).get('layout')==='D')returnPath='index.html?layout=D';
const eventLayoutD=returnPath.endsWith('layout=D');
document.body?.classList.toggle('layout-d',eventLayoutD);
document.querySelectorAll('[data-return],#returnTop').forEach(a=>a.href=returnPath);
const requestOrigin=()=>request?.origin||('Default/'+(request?.relation?.device||'unknown')+'/'+(request?.relation?.id?'id-'+request.relation.id:'draft-legacy'));
const eventDraftKey=()=>eventMode+':'+(eventMode==='copy'?request.sourceGroup+':'+requestOrigin():eventScope||(request?'context-'+requestOrigin():'new'));
function keepEventDraft(){if(eventDraft){normalizeTargetActions();eventDraft.context=request?clone(request):null;eventDrafts[eventDraftKey()]=clone(eventDraft);persistEventDrafts();refreshDraftIndicators()}}
function openEvent(groupId,memberId,showEditor=true){keepEventDraft();eventEditorOpen=showEditor;eventOutputQuery='';eventMode=memberId?'single':groupId?'group':'new';eventScope=memberId||groupId||null;eventSelected=groupId||null;const members=memberId?[ev(memberId)]:groupId?db.events.filter(e=>e.group===groupId):[],first=members[0];eventDraft=clone(eventDrafts[eventDraftKey()]||{name:groupName(groupId)||first?.name||'',action:first?.action||'Momentary',duration:first?first.duration:0,delay:first?.delay??null,targets:members.map(e=>({device:e.device,port:e.port,action:e.action,...actionTiming(e)})),memberIds:members.map(e=>e.id)});Object.assign(eventDraft,actionTiming(eventDraft));eventError='';renderEvents();}
function eventImpact(){return eventChanged()?references(eventDraft.memberIds):[]}
function visibleEvents(){return db.events.filter(eventMatchesFilters)}
function deviceEventList(){const byDevice=new Map();for(const e of visibleEvents()){if(!byDevice.has(e.device))byDevice.set(e.device,[]);byDevice.get(e.device).push(e)}return [...byDevice].map(([id,events])=>`<section class="event-group"><div class="group-heading"><div><strong>${esc(deviceLabel(dev(id)))}</strong><small class="block">${dev(id).code} · ${new Set(events.map(e=>e.port)).size} 个输出</small></div></div>${events.sort((a,b)=>a.port-b.port).map(e=>`<div class="device-event-line ${eventMode==='single'&&eventScope===e.id?'chosen':''}"><span class="tag">输出${e.port}</span><div><strong>${esc(e.name)}</strong>${eventHasDraft(e.id)?'<small class="unsaved-badge">有未保存修改</small>':''}<small>${actionLabel(e.action)} · ${timeText(e)} · ${references([e.id]).length} 条关系引用</small></div><button class="link" data-ea="single" data-id="${e.id}">编辑</button>${groupById(e.group).events.length>1?`<button class="link danger" data-ea="deleteone" data-id="${e.id}" aria-label="从事件移除 ${esc(e.name)} ${esc(targetLabel(e))}">移除</button>`:''}</div>`).join('')}</section>`).join('')||'<div class="empty">没有匹配的设备或事件</div>'}
function openCopy(){keepEventDraft();eventEditorOpen=true;const source=groupById(request.sourceGroup);if(!source){eventDraft=null;eventError='原事件已不可用，请返回关系重新选择。';renderEvents();return}eventMode='copy';eventScope=source.id;eventSelected=null;eventDraft=clone(eventDrafts[eventDraftKey()]||{name:uniqueCopyName(source.name),action:source.events[0].action,...actionTiming(source.events[0]),targets:source.events.map(savedTarget),memberIds:[]});eventError='';renderEvents()}
function saveReturnEnabled(){return request&&(request.mode==='copy'?eventMode==='copy':request.mode==='edit'?['single','group'].includes(eventMode)&&(eventMode==='single'?ev(eventScope)?.group:eventScope)===request.sourceGroup:request.mode==='new'&&eventMode==='new')}
function returnToSource(group){sessionStorage.setItem('iced-event-result',JSON.stringify({origin:requestOrigin(),eventIds:request.mode==='edit'?[]:[group],replaceGroup:request.mode==='copy'?request.sourceGroup:null}));sessionStorage.removeItem('iced-event-request');location.href=returnPath}
function saveButtonText(){return saveReturnEnabled()?(request.mode==='edit'?'保存并返回原关系':'保存新事件并返回关联'):'保存'}
function renderEvents(){normalizeTargetActions();const groups=eventGroups(),filtered=groups.filter(g=>g.events.some(eventMatchesFilters));
if(eventLayoutD){renderEventsD(filtered);renderEventDrawer();return}
$('#eventsContent').innerHTML=timingReviewNotice()+deletionNotice()+reuseResultUI()+draftTray()+`<div class="event-tools"><div class="searchfield"><label for="eventSearch">搜索事件或设备</label><input id="eventSearch" type="search" placeholder="事件名称、设备编号或控制器" value="${esc(eventQuery)}"></div><div><label for="eventFilterAction">动作类型</label><select id="eventFilterAction"><option value="">全部动作</option>${ACTIONS.map(a=>`<option value="${a}" ${eventActionFilter===a?'selected':''}>${actionLabel(a)}</option>`).join('')}</select></div>${eventUsageControl()}<button data-ea="filterdevice">${eventDeviceFilter?esc(dev(eventDeviceFilter).short):'筛选适用设备'}</button>${eventDeviceFilter?'<button class="link" data-ea="clearfilter">清除设备筛选</button>':''}<button class="primary" data-ea="new">新增</button></div><div class="view-switch" role="group" aria-label="事件查看方式"><button data-ea="viewdevice" aria-pressed="${eventView==='device'}">按设备查看</button><button data-ea="viewgroup" aria-pressed="${eventView==='group'}">按事件查看</button><small>${eventView==='device'?'安装核对：按设备、输出查找事件':'选择事件查看完整执行内容'}</small></div><div class="eventlayout batch-events"><div class="eventlist"><div class="listtop"><h3>${eventView==='device'?'设备输出配置':'自定义事件'} <small>${eventView==='device'?visibleEvents().length+' 条':filtered.length+' 个'}</small></h3><small>${eventView==='device'?'编辑定义会影响所有引用关系':'展开查看每个输出的配置'}</small></div><div class="event-groups">${eventView==='device'?deviceEventList():filtered.map(g=>{const refs=references(g.events.map(e=>e.id));return `<section class="event-group ${g.id===eventSelected?'chosen':''}"><div class="group-heading"><div><strong>${esc(g.name)}</strong>${g.events.some(e=>eventHasDraft(e.id))?'<small class="unsaved-badge">有未保存修改</small>':''}<p><span class="tag">${groupActionText(g)}</span><small>${groupTimeText(g)}</small></p></div><button class="link" data-ea="edit" data-group="${g.id}">编辑</button></div><details><summary>${g.events.length} 个输出 · ${new Set(g.events.map(e=>e.device)).size} 台设备 · ${refs.length} 条关系引用 · 当前匹配 ${g.events.filter(eventMatchesFilters).length} 个输出</summary><div class="member-list">${g.events.filter(eventMatchesFilters).map(e=>`<div><span>${esc(targetLabel(e))}<small>${dev(e.device).code} · ${actionLabel(e.action)} · ${timeText(e)}</small></span><button class="link" data-ea="single" data-id="${e.id}">编辑</button>${groupById(e.group).events.length>1?`<button class="link danger" data-ea="deleteone" data-id="${e.id}">移除</button>`:''}</div>`).join('')}</div></details></section>`}).join('')||'<div class="empty">没有匹配的事件配置</div>'}</div></div></div>`;renderEventDrawer();}
function eventEditor(){
 if(!eventDraft)return '<div class="empty">选择事件或新增配置</div>';
 normalizeTargetActions();const e=eventDraft,refs=references(e.memberIds);
 return `<div class="editorhead"><div><h2 id="eventEditorTitle">${eventMode==='copy'?(request?.mode==='local-copy'?'复制':'为本关系创建独立事件'):eventMode==='new'?'新增':'编辑'}</h2><small>一个事件统一名称，每个输出独立设置动作和时间。</small><small id="eventDraftState" class="event-draft-state">${eventDraftDirty(e)?'有未保存修改 · 草稿已保留':['new','copy'].includes(eventMode)?'未保存':'已保存'}</small></div><button class="event-drawer-close" data-ea="closeeditor" aria-label="关闭编辑并保留草稿" title="关闭并保留草稿">×</button></div><div class="event-editor-body">
 ${saveReturnEnabled()?`<div class="context-note">来自 I/O 关系${request.relation?.name?'：'+esc(request.relation.name):''} · 原草稿已保留<br>${request.mode==='edit'?'修改会更新所有引用关系；保存后返回原关系草稿。':'先保存新事件，再返回保存关系。'}${eventMode==='copy'?'事件参数独立，物理输出仍可能受其他关系控制；原事件引用保持不变。':''}</div>`:''}
 ${eventMode==='copy'&&request?.mode==='local-copy'?'<div class="context-note">已复制全部输出及动作参数。保存后生成独立事件，不改变原事件或已有关系。</div>':''}
 <p class="scope-hint">关系引用整个事件。保存名称、输出或动作的修改后，所有引用关系自动使用最新完整内容。</p>
 ${eventError?`<div class="error" role="alert">${esc(eventError)}</div>`:''}
 ${draftConflictsUI()}
 <div class="field"><label for="eventName">事件名称${eventMode==='single'?'':' *'}</label><input id="eventName" maxlength="50" value="${esc(e.name)}" ${eventMode==='single'?'readonly aria-readonly="true"':''} placeholder="例如：机房报警联动">${eventMode==='single'?`<small>此名称用于整个事件；这里只修改当前输出的动作。</small><button class="link" data-ea="editname">编辑完整事件 / 修改名称</button>`:'<small>所有输出共用此名称，动作与时间分别设置。</small>'}</div>
 <div id="eventNameWarning">${sameNameWarning()}</div>
 <div class="sectiontitle"><h3>输出与独立动作</h3><span class="andbadge">${e.targets.length} 个输出</span></div>
 <button class="devicepick" data-ea="targets" ${eventMode==='single'?'disabled':''}><span>${eventMode==='single'?'输出目标固定':'选择 / 调整输出'}</span><span class="pick-icon">＋</span></button>
 ${e.targets.length>1?`<details class="bulk-action-tools"><summary>批量设置相同动作（可选）</summary><p class="hint">仅点击应用时才覆盖全部已选输出的动作和时间；之后仍可逐项调整。</p>${actionFields(e,'bulk')}<button data-ea="applybulk">应用到全部 ${e.targets.length} 个输出</button></details>`:''}
 ${e.targets.length?`<div class="field output-locator"><label for="eventOutputSearch">定位事件内的输出</label><input id="eventOutputSearch" type="search" value="${esc(eventOutputQuery)}" placeholder="搜索设备名称、编号或输出"><small>只筛选下方编辑列表，全部 ${e.targets.length} 个输出仍会保存和执行。</small></div>`:''}
 <div class="per-output-actions" id="eventOutputCards">${outputActionCards()}</div>
 ${refs.length?`<details class="impact-note"><summary>已保存配置共被 ${refs.length} 条关系引用 · 查看</summary>${refs.map(r=>`<p>${esc(dev(r.device).short)} / ${esc(r.name)}</p>`).join('')}<small>保存确认只列出本次实际修改所影响的关系。</small></details>`:''}
 </div><div class="actions"><span class="savehint">${e.targets.length} 个输出分别保存各自参数${eventMode==='single'?'；保留原组归属':''}</span><button data-ea="discard">取消</button><button class="primary" data-ea="save">${saveButtonText()}</button>${!['new','copy'].includes(eventMode)?`<button data-ea="copycurrent">复制</button><button class="link danger" data-ea="deletecurrent">${eventMode==='single'?'移除':'删除'}</button>`:''}</div>`;
}
function actionFields(t,index){
 const prefix=index==='bulk'?'批量':targetLabel(t);
 return `<div class="field"><label for="action-${index}">${index==='bulk'?'批量动作':'动作'} *</label><select id="action-${index}" data-target-action="${index}" aria-label="${esc(prefix)} 动作">${ACTIONS.map(a=>`<option value="${a}" ${t.action===a?'selected':''}>${actionLabel(a)}</option>`).join('')}</select></div>
 <div class="field"><label for="duration-${index}">启动延迟（秒）*</label><input id="duration-${index}" type="number" min="0" max="255" step="1" data-target-time="${index}" data-time-key="duration" aria-label="${esc(prefix)} 启动延迟 Duration 秒" value="${t.duration??''}" placeholder="0"><small>Duration · 0～255 秒，默认 0 秒，表示立即启动。</small></div>
 ${t.action==='Delay'?`<div class="field"><label for="time-${index}">输出持续时间（秒）*</label><input id="time-${index}" type="number" min="1" max="255" step="1" data-target-time="${index}" data-time-key="delay" aria-label="${esc(prefix)} 输出持续时间 N 秒" value="${t.delay??''}" placeholder="1～255"><small>N · 1～255 秒，从开始输出时计时。</small></div>`:''}`;
}
function validateEvent(){normalizeTargetActions();const e=eventDraft;if(e.conflicts?.length)return '请先确认草稿与已保存配置的差异。';if(!e.name.trim())return '请填写事件名称。';if(!e.targets.length)return '请至少选择一个输出。';for(const t of e.targets){if(!ACTIONS.includes(t.action))return targetLabel(t)+'：请选择有效动作。';if(actionTimeError(t))return targetLabel(t)+'：'+actionTimeError(t);}if(new Set(e.targets.map(targetKey)).size!==e.targets.length)return '同一配置不能重复包含同一个输出。';if(e.targets.some(o=>!dev(o.device)||o.port<1||o.port>dev(o.device).outs))return '存在不可用的输出目标。';const removed=e.memberIds.map(ev).filter(Boolean).filter(x=>!e.targets.some(t=>targetKey(t)===targetKey(x)));if(removed.some(x=>eventDrafts['single:'+x.id]&&eventDraftDirty(eventDrafts['single:'+x.id])))return '待移除的输出还有未保存的单项草稿，请先保存或放弃该草稿，再从事件中移除。';return '';}
function askEventSave(skipDuplicates=false){if(!skipDuplicates)eventSaveOptions={};if(!eventChanged()){if(saveReturnEnabled()){returnToSource(eventScope);return}closeEventEditor();toast('没有修改，无需保存。');return}eventError=validateEvent();if(eventError){renderEvents();return}if(!eventSaveOptions.allowSameName&&askSameNameSave())return;if(!skipDuplicates&&askDuplicateSave())return;const refs=eventImpact();if(refs.length){$('#impactDialog').innerHTML=`<div class="dialogtitle"><h2>确认修改完整事件</h2></div><div class="dialogbody">${eventChangeSummary()}<p>以下 ${refs.length} 条已保存关系将自动使用修改后的事件：</p><ul>${refs.map(r=>`<li>${esc(dev(r.device).short)} / ${esc(r.name)}</li>`).join('')}</ul><div class="actions"><button data-ea="cancelimpact">返回检查</button><button class="primary" data-ea="confirmsave">确认保存</button></div></div>`;$('#impactDialog').showModal()}else saveEvent();}
function saveEvent(options=eventSaveOptions){
 if(!eventChanged()){if(saveReturnEnabled()){returnToSource(eventScope);return}closeEventEditor();toast('没有修改，无需保存。');return}
 eventError=validateEvent();if(eventError){renderEvents();return}
 const e=eventDraft,ids=e.memberIds,old=db.events.filter(x=>ids.includes(x.id)),key=eventDraftKey(),wasSingle=eventMode==='single',returnToRelation=saveReturnEnabled();
 const reused=options.reuse&&eventMode!=='copy'?duplicateCompleteEvent():null;
 let next=Math.max(db.nextEventId||1,1,...db.events.map(x=>x.id+1));
 const group=reused?.id||(eventMode==='group'?eventScope:wasSingle?ev(eventScope).group:'batch-'+Date.now()+'-'+next);
 const name=wasSingle?groupName(group):e.name.trim();
 if(!reused){const saved=e.targets.map(t=>{const existing=old.find(x=>targetKey(x)===targetKey(t));return {id:existing?.id||next++,group,name,action:t.action,...actionTiming(t),device:t.device,port:t.port}});db.events=db.events.filter(x=>!ids.includes(x.id)).concat(saved);db.eventNames[group]=name;db.nextEventId=next;persist();}
 delete eventDrafts[key];rebaseEventDrafts(group,key);eventDraft=null;eventSaveOptions={};
 if($('#impactDialog').open)$('#impactDialog').close();if($('#eventWorkflowDialog').open)$('#eventWorkflowDialog').close();
 sessionStorage.setItem('iced-event-save-notice',JSON.stringify({text:returnToRelation?(request.mode==='edit'?'事件已更新，所有引用关系自动使用最新完整内容；原关系草稿已保留。':'自定义事件已准备好，请返回保存关系。放弃关系草稿不会删除新建事件。'):'事件已保存；所有引用关系自动使用最新的完整事件，无需重新选择输出。'}));
 if(reused){reusedOutputs={eventIds:[group]};sessionStorage.setItem('iced-reused-complete-events',JSON.stringify(reusedOutputs));}
 if(returnToRelation){returnToSource(group);return}
 if(request?.mode==='local-copy'){request=null;sessionStorage.removeItem('iced-event-request')}
 openEvent(group,wasSingle?ids[0]:null,false);toast(reused?'已复用完整事件，未重复创建。':'事件已保存；已有引用关系自动使用最新完整内容。');
}
document.addEventListener('input',e=>{const t=e.target;if(t.id==='eventOutputSearch'){eventOutputQuery=t.value;$('#eventOutputCards').innerHTML=outputActionCards()}if(t.id==='eventSearch'){eventQuery=t.value;const pos=t.selectionStart;renderEvents();$('#eventSearch').focus();$('#eventSearch').setSelectionRange(pos,pos)}if(t.id==='eventName'&&eventMode!=='single'){eventDraft.name=t.value;keepEventDraft();$('#eventNameWarning').innerHTML=sameNameWarning()}});
document.addEventListener('change',e=>{if(e.target.id==='eventUsageFilter'){eventUsageFilter=e.target.value;renderEvents()}if(e.target.id==='eventFilterAction'){eventActionFilter=e.target.value;renderEvents()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-return],#returnTop')){keepEventDraft();sessionStorage.removeItem('iced-event-request')}const b=e.target.closest('[data-ea]');if(!b)return;const a=b.dataset.ea;
 if(a==='resumedraft')resumeEventDraft(b.dataset.key);
 if(a==='resolve')resolveEventConflict(Number(b.dataset.index),b.dataset.choice);
 if(a==='editname')openEvent(ev(eventScope)?.group);
 if(a==='deleteone')askDeleteEvents([Number(b.dataset.id)]);
 if(a==='deletecurrent')askDeleteEvents(eventDraft.memberIds,eventMode==='group');
 if(a==='confirmdeleteevent')deletePendingEvents();
 if(a==='undodelete')undoEventDeletion();if(a==='confirmrestore')undoEventDeletion(true);if(a==='samenamesave'){eventSaveOptions.allowSameName=true;$('#eventWorkflowDialog').close();askEventSave(true)}if(a==='locatename'){if($('#eventWorkflowDialog').open)$('#eventWorkflowDialog').close();openEvent(b.dataset.group)}
 if(a==='cancelworkflow')$('#eventWorkflowDialog').close();
 if(a==='duplicatereuse'||a==='duplicateindependent'){eventSaveOptions={...eventSaveOptions,reuse:a==='duplicatereuse'};$('#eventWorkflowDialog').close();askEventSave(true)}
 if(a==='dismissreuse'){reusedOutputs=null;sessionStorage.removeItem('iced-reused-complete-events');renderEvents()}
 if(a==='reusedrelation')startRelationWithEvents(reusedOutputs.eventIds);
 if(a==='viewdevice'||a==='viewgroup'){eventView=a==='viewdevice'?'device':'group';renderEvents()}if(a==='new')openEvent(null);if(a==='edit')openEvent(b.dataset.group);if(a==='single'){const item=ev(b.dataset.id);openEvent(item.group,item.id)}if(a==='targets')openOutputPicker({mode:'targets',selected:eventDraft.targets,onConfirm:items=>{reconcileEventTargets(items);keepEventDraft();renderEvents()}});if(a==='filterdevice')openDevicePicker({title:'筛选适用设备',selected:eventDeviceFilter,onSelect:id=>{eventDeviceFilter=id;renderEvents()}});if(a==='clearfilter'){eventDeviceFilter='';renderEvents()}if(a==='discard')discardEventEdit();if(a==='closeeditor')closeEventEditor();if(a==='applybulk')applyBulkActions();if(a==='copycurrent')copyCurrentEvent();if(a==='save')askEventSave();if(a==='cancelimpact')$('#impactDialog').close();if(a==='confirmsave')saveEvent();});
$('#eventEditDialog').addEventListener('cancel',e=>{e.preventDefault();closeEventEditor()});
window.addEventListener('beforeunload',keepEventDraft);
const requestedEvent=ev(new URLSearchParams(location.search).get('event')),requestedGroup=new URLSearchParams(location.search).get('group');
if(['copy','local-copy'].includes(request?.mode)){openCopy()}else if(request?.mode==='edit'){openEvent(request.sourceGroup)}else if(request){openEvent(null);if(!eventDraft.targets.length)eventDraft.targets=clone(request.targets||[]);renderEvents()}else if(requestedGroup&&groupById(requestedGroup))openEvent(requestedGroup);else if(requestedEvent)openEvent(requestedEvent.group);else {const nav=readSession('iced-event-editor',null);if(nav?.open&&eventDrafts[nav.key])resumeEventDraft(nav.key);else openEvent(db.events[0]?.group||null,null,false);}

// Legacy drafts had one action for all targets; materialize it once per target.
function normalizeTargetActions(){if(!eventDraft)return;for(const t of eventDraft.targets){if(!t.action){const old=eventDraft.memberIds.map(ev).find(e=>e&&targetKey(e)===targetKey(t));Object.assign(t,{action:eventDraft.action||old?.action||'Momentary',...actionTiming(eventDraft.action?eventDraft:old||{action:'Momentary'})})}Object.assign(t,actionTiming(t));}prepareEventDraft(eventDraft,eventMode);}
function reconcileEventTargets(items){const old=new Map(eventDraft.targets.map(t=>[targetKey(t),t]));eventDraft.targets=items.map(t=>clone(old.get(targetKey(t))||{device:t.device,port:t.port,action:'Momentary',duration:0,delay:null}));}
function targetWasChanged(t){const old=eventDraft.memberIds.map(ev).find(e=>e&&targetKey(e)===targetKey(t));return !old||(eventMode!=='single'&&old.name!==eventDraft.name.trim())||old.action!==t.action||JSON.stringify(actionTiming(old))!==JSON.stringify(actionTiming(t));}
function changedEventIds(){normalizeTargetActions();return eventDraft.memberIds.filter(id=>{const old=ev(id),t=old&&eventDraft.targets.find(t=>targetKey(t)===targetKey(old));return !t||targetWasChanged(t)});}
function eventChanged(){if(!eventDraft)return false;normalizeTargetActions();return !!eventDraft.conflicts?.length||['new','copy'].includes(eventMode)||changedEventIds().length>0||eventDraft.targets.some(t=>targetWasChanged(t));}
function applyBulkActions(){if(actionTimeError(eventDraft)){eventError=actionTimeError(eventDraft);renderEvents();return}eventDraft.targets.forEach(t=>Object.assign(t,{action:eventDraft.action,...actionTiming(eventDraft)}));eventError='';keepEventDraft();renderEvents();toast('已将相同参数应用到全部已选输出的草稿，可逐项调整。');}
document.addEventListener('change',e=>{const index=e.target.dataset.targetAction;if(index===undefined)return;const t=index==='bulk'?eventDraft:eventDraft.targets[Number(index)];t.action=e.target.value;Object.assign(t,actionTiming(t));eventError='';keepEventDraft();renderEvents();if(index==='bulk')document.querySelector('.bulk-action-tools')?.setAttribute('open','');document.querySelector('#action-'+index)?.focus();});
document.addEventListener('input',e=>{const index=e.target.dataset.targetTime;if(index===undefined)return;const t=index==='bulk'?eventDraft:eventDraft.targets[Number(index)];t[e.target.dataset.timeKey]=e.target.value===''?null:Number(e.target.value);eventError='';document.querySelector('.error')?.remove();keepEventDraft();});
function copyCurrentEvent(){
 if(eventChanged()){eventError='请先保存或取消当前修改，再复制事件。';renderEvents();return}
 const group=eventMode==='single'?ev(eventScope)?.group:eventScope;
 if(!groupById(group)){eventError='事件已不可用，请重新选择。';renderEvents();return}
 keepEventDraft();eventDraft=null;
 request={mode:'local-copy',sourceGroup:group,origin:'Default/events/copy'};
 sessionStorage.setItem('iced-event-request',JSON.stringify(request));
 openCopy();keepEventDraft();
}
function startRelationWithEvents(eventIds){
 if(eventIds.some(id=>!groupById(id))){eventError='事件已不可用，请重新选择。';renderEvents();return}
 const previousNav=readSession('iced-io-navigation',null);
 openDevicePicker({title:'选择新关系的输入来源设备',selected:previousNav?.device||null,onSelect:source=>{
  if((db.rules[source]||[]).length>=20){eventError='该输入来源设备已达到 20 条关系上限，请选择其他来源设备。';renderEvents();return}
  const previous=readSession('iced-relation-drafts',{})[source+':new'];
  if(hasRelationDraft(previous)&&!window.confirm('该设备已有未保存的新增关系。用此完整事件替换该新增草稿？已保存的关系不受影响。'))return;
  keepEventDraft();sessionStorage.removeItem('iced-event-request');sessionStorage.removeItem('iced-event-result');sessionStorage.setItem('iced-new-relation-events',JSON.stringify({source,eventIds}));location.href=returnPath;
 }});
}


function outputActionCards(){
 const words=eventOutputQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matches=eventDraft.targets.map((t,i)=>({t,i})).filter(({t})=>words.every(w=>(targetLabel(t)+' '+dev(t.device).code).toLowerCase().includes(w)));
 return `${eventOutputQuery?`<p class="hint" role="status">显示 ${matches.length} / ${eventDraft.targets.length} 个输出</p>`:''}`+matches.map(({t,i})=>`<section class="output-action-card"><div class="outrowhead"><strong>${esc(targetLabel(t))}</strong></div><small>${esc(dev(t.device).code)}</small>${actionFields(t,i)}<p class="hint">${ACTION_INFO[t.action]?.description||''}</p></section>`).join('')+(matches.length?'':`<div class="empty">${eventDraft.targets.length?'没有匹配的输出。清空搜索可查看全部。':'先选择一个或多个输出，再分别设置动作和时间。'}</div>`);
}
function eventChangeSummary(){
 const group=eventMode==='single'?ev(eventScope)?.group:eventScope;
 const before=groupById(group)?.events||[];
 const next=eventMode==='single'?before.map(e=>eventDraft.targets.find(t=>targetKey(t)===targetKey(e))||savedTarget(e)):eventDraft.targets;
 return eventChangesUI(group,next,eventDraft.name)+eventControlsImpactUI(group,next);
}


function renderEventDrawer(){
 const panel=$('#eventEditDialog');
 sessionStorage.setItem('iced-event-editor',JSON.stringify({open:eventEditorOpen,key:eventDraft?eventDraftKey():null}));
 if(!eventEditorOpen||!eventDraft){if(panel.open)panel.close();return}
 const scroll=$('.event-editor-body')?.scrollTop||0;
 const focusId=panel.contains?.(document.activeElement)?document.activeElement?.id:null;
 panel.innerHTML=eventEditor();
 if(!panel.open)panel.showModal();
 else {const body=$('.event-editor-body');if(body)body.scrollTop=scroll;
  if(focusId)document.querySelector('#'+focusId)?.focus?.();
 }
}
function closeEventEditor(preserveDraft=true){
 if(preserveDraft)keepEventDraft();
 eventEditorOpen=false;renderEvents();
 const selector=eventMode==='group'?`[data-ea="edit"][data-group="${eventScope}"]`:eventMode==='single'?`[data-ea="single"][data-id="${eventScope}"]`:'[data-ea="new"]';
 document.querySelector(selector)?.focus?.();
}
function discardEventEdit(){
 delete eventDrafts[eventDraftKey()];persistEventDrafts();
 const scope=eventScope,mode=eventMode;eventDraft=null;
 if(mode==='copy'){
  if(request?.mode==='local-copy'){request=null;sessionStorage.removeItem('iced-event-request');openEvent(scope,null,false)}
  else {openCopy();closeEventEditor(false)}
 }else openEvent(mode==='group'?scope:mode==='single'?ev(scope)?.group:null,mode==='single'?scope:null,false);
}
