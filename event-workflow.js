// 名称、草稿协调、重复配置与未引用事件清理。仅修改本标签页原型数据。
let eventUsageFilter='all',eventSaveOptions={},pendingEventDelete=null;
let reusedOutputs=readSession('iced-reused-complete-events',null);
let deletedEvents=readSession('iced-deleted-events',null);
const targetConfig=t=>t?JSON.stringify({action:t.action,...actionTiming(t)}):null;
const savedTarget=e=>({device:e.device,port:e.port,action:e.action,...actionTiming(e)});
function savedDraftSnapshot(ids,name){return {name,memberIds:ids,targets:ids.map(ev).filter(Boolean).map(savedTarget)}}
function draftShape(d){return JSON.stringify({name:d.name.trim(),targets:d.targets.map(t=>({key:targetKey(t),config:targetConfig(t)})).sort((a,b)=>a.key.localeCompare(b.key))})}
function prepareEventDraft(d,mode){
 if(!d.base)d.base=savedDraftSnapshot(d.memberIds,mode==='single'?groupName(ev(d.memberIds[0])?.group):d.memberIds.length?groupName(ev(d.memberIds[0])?.group):'');
 d.conflicts ||= [];
 if(mode==='single'){d.name=groupName(ev(d.memberIds[0])?.group);d.base.name=d.name;}
}
function eventDraftDirty(d){return !!d&&(!!d.conflicts?.length||draftShape(d)!==draftShape(d.base||savedDraftSnapshot(d.memberIds,d.memberIds.length?groupName(ev(d.memberIds[0])?.group):'')))}
function eventHasDraft(id){return Object.values(eventDrafts).some(d=>d.memberIds.includes(Number(id))&&eventDraftDirty(d))||(eventDraft?.memberIds.includes(Number(id))&&eventDraftDirty(eventDraft))}
function persistEventDrafts(){sessionStorage.setItem('iced-event-drafts',JSON.stringify(eventDrafts))}
function draftTray(){const entries=Object.entries(eventDrafts).filter(([,d])=>eventDraftDirty(d));return entries.length?`<details class="draft-notice event-draft-tray"><summary>有 ${entries.length} 份未保存的事件草稿 · 继续编辑</summary>${entries.map(([key,d])=>`<button class="link" data-ea="resumedraft" data-key="${esc(key)}">${esc(d.name||'未命名事件')} · ${key.startsWith('single:')?'单个输出':key.startsWith('copy:')?'独立副本':'整组'} · ${d.targets.length} 个输出${d.context?.relation?' · 来自 '+esc(d.context.relation.name||'未命名关系'):''}${d.conflicts?.length?' · 需确认差异':''}</button>`).join('')}</details>`:''}
function refreshDraftIndicators(){const state=$('#eventDraftState');if(state)state.textContent=eventDraftDirty(eventDraft)?'有未保存修改 · 草稿已保留':['new','copy'].includes(eventMode)?'未保存':'已保存';}
function resumeEventDraft(key){
 const value=eventDrafts[key];if(!value)return;
 keepEventDraft();eventMode=key.split(':')[0];eventDraft=clone(value);request=value.context||null;
 eventScope=eventMode==='single'?value.memberIds[0]:eventMode==='group'?key.slice(6):eventMode==='copy'?request?.sourceGroup:null;
 eventSelected=eventMode==='group'?eventScope:eventMode==='single'?ev(eventScope)?.group:null;
 if(request)sessionStorage.setItem('iced-event-request',JSON.stringify(request));else sessionStorage.removeItem('iced-event-request');
 prepareEventDraft(eventDraft,eventMode);eventError='';eventEditorOpen=true;renderEvents();
}
// 按“编辑前 / 草稿 / 最新保存值”协调，保存一个成员不丢弃其他成员草稿。
function rebaseEventDrafts(changedGroup,excludeKey){
 for(const [key,d] of Object.entries(eventDrafts)){
  if(key===excludeKey)continue;if(key.startsWith('single:')&&!d.memberIds.some(id=>ev(id))){delete eventDrafts[key];continue;}
  const mode=key.split(':')[0];if(!['single','group'].includes(mode))continue;
  if(mode==='group'?key.slice(6)!==changedGroup:!d.memberIds.some(id=>ev(id)?.group===changedGroup)&&!d.base?.memberIds.some(id=>ev(id)?.group===changedGroup))continue;
  const ids=mode==='group'?db.events.filter(e=>e.group===changedGroup).map(e=>e.id):d.memberIds.filter(id=>ev(id));
  const remote=savedDraftSnapshot(ids,groupName(changedGroup)),base=d.base||remote;
  const before=new Map(base.targets.map(t=>[targetKey(t),t])),ours=new Map(d.targets.map(t=>[targetKey(t),t])),theirs=new Map(remote.targets.map(t=>[targetKey(t),t]));
  const conflicts=new Map((d.conflicts||[]).map(c=>[c.key,c]));
  if(mode==='single'||d.name===base.name)d.name=remote.name;
  else if(remote.name!==base.name&&d.name!==remote.name)conflicts.set('name',{key:'name',label:'事件名称',remote:remote.name});
  const merged=[];
  for(const key of new Set([...ours.keys(),...theirs.keys(),...before.keys()])){
   const b=before.get(key),o=ours.get(key),t=theirs.get(key),localChanged=targetConfig(o)!==targetConfig(b),remoteChanged=targetConfig(t)!==targetConfig(b);
   if(!localChanged){if(t)merged.push(clone(t));conflicts.delete(key)}
   else{if(o)merged.push(o);if(remoteChanged&&targetConfig(o)!==targetConfig(t))conflicts.set(key,{key,label:targetLabel(o||t||b),remote:t||null});}
  }
  d.targets=merged;d.memberIds=ids;d.base=clone(remote);d.conflicts=[...conflicts.values()];
 }
 persistEventDrafts();
}
function draftConflictsUI(){return eventDraft.conflicts?.length?`<div class="draft-conflicts" role="alert"><strong>同一配置还有另一份修改，请逐项确认</strong>${eventDraft.conflicts.map((c,i)=>{const local=c.key==='name'?eventDraft.name:eventDraft.targets.find(t=>targetKey(t)===c.key);return `<div><b>${esc(c.label)}</b><p>我的草稿：${esc(c.key==='name'?local:local?actionLabel(local.action)+' · '+timeText(local):'移除此输出')}</p><p>已保存：${esc(c.key==='name'?c.remote:c.remote?actionLabel(c.remote.action)+' · '+timeText(c.remote):'已移除此输出')}</p><button data-ea="resolve" data-index="${i}" data-choice="saved">使用已保存值</button><button data-ea="resolve" data-index="${i}" data-choice="mine">保留我的修改</button></div>`}).join('')}</div>`:''}
function resolveEventConflict(index,choice){const c=eventDraft.conflicts[index];if(!c)return;if(choice==='saved'){if(c.key==='name')eventDraft.name=c.remote;else{eventDraft.targets=eventDraft.targets.filter(t=>targetKey(t)!==c.key);if(c.remote)eventDraft.targets.push(clone(c.remote));}}eventDraft.conflicts.splice(index,1);eventError='';keepEventDraft();renderEvents()}
function eventMatchesFilters(e){return (!eventActionFilter||e.action===eventActionFilter)&&(!eventDeviceFilter||e.device===eventDeviceFilter)&&(eventUsageFilter!=='unused'||!references([e.id]).length)&&(eventUsageFilter!=='used'||references([e.id]).length>0)&&[e.name,e.action,targetLabel(e),dev(e.device).code].join(' ').toLowerCase().includes(eventQuery.toLowerCase())}
function eventUsageControl(){return `<div><label for="eventUsageFilter">引用状态</label><select id="eventUsageFilter"><option value="all" ${eventUsageFilter==='all'?'selected':''}>全部事件</option><option value="unused" ${eventUsageFilter==='unused'?'selected':''}>未被关系引用</option><option value="used" ${eventUsageFilter==='used'?'selected':''}>已被关系引用</option></select></div>`}
function completeEventSignature(targets){return JSON.stringify(targets.map(t=>({key:targetKey(t),config:targetConfig(t)})).sort((a,b)=>a.key.localeCompare(b.key)))}
function duplicateCompleteEvent(){if(!['new','copy'].includes(eventMode))return null;const signature=completeEventSignature(eventDraft.targets);return eventGroups().find(g=>completeEventSignature(g.events)===signature)||null}
function askDuplicateSave(){if(eventMode==='copy')return false;const match=duplicateCompleteEvent();if(!match)return false;$('#eventWorkflowDialog').innerHTML=`<div class="dialogtitle"><h2>已有内容完全相同的自定义事件</h2></div><div class="dialogbody"><p>“${esc(match.name)}”包含相同的全部设备、输出、动作和时间。可直接复用整个事件。</p>${executionList(match)}<p class="hint">复用后保持原事件名称，之后修改原事件会影响所有引用关系。需要独立维护时，可保留独立事件。</p><div class="actions"><button data-ea="cancelworkflow">返回调整</button><button data-ea="duplicateindependent">保留独立事件</button><button class="primary" data-ea="duplicatereuse">复用完整事件</button></div></div>`;$('#eventWorkflowDialog').showModal();return true}
function reuseResultUI(){return reusedOutputs?`<div class="context-note"><strong>已复用完整自定义事件</strong><p>${reusedOutputs.eventIds.map(id=>esc(groupName(id)||'事件不可用')).join('、')} · 未重复创建</p><button class="link" data-ea="reusedrelation">用此事件新建关系 →</button><button class="link" data-ea="dismissreuse">收起提示</button></div>`:''}
function relationDraftReferences(ids){return Object.entries(readSession('iced-relation-drafts',{})).filter(([,d])=>ruleEventIds(d).some(group=>ids.map(ev).filter(Boolean).some(e=>e.group===group))).filter(([key,d])=>{const source=key.slice(0,key.lastIndexOf(':'));const saved=db.rules[source]?.find(r=>r.id===d.id);return !saved||JSON.stringify(saved)!==JSON.stringify(d)}).map(([key,d])=>({name:d.name||'未命名关系',source:key.slice(0,key.lastIndexOf(':'))}))}


function editedGroupId(){return eventMode==='single'?ev(eventScope)?.group:eventMode==='group'?eventScope:null}
function sameNameEvents(){return eventGroups().filter(g=>g.id!==editedGroupId()&&g.name.trim()===eventDraft.name.trim())}
function sameNameWarning(){const matches=sameNameEvents();return matches.length?`<div class="scope-hint"><strong>当前点位已有 ${matches.length} 个同名事件，请核对用途。</strong>${matches.map(g=>`<p>${esc(g.name)} · ${g.events.length} 个输出 <button class="link" data-ea="locatename" data-group="${esc(g.id)}">查看已有事件（保留当前草稿）</button></p>`).join('')}<small>允许保留同名事件；建议使用位置或用途区分名称。</small></div>`:''}
function askSameNameSave(){if(eventMode==='single'||(eventMode==='group'&&eventDraft.name.trim()===groupName(eventScope))||!sameNameEvents().length)return false;$('#eventWorkflowDialog').innerHTML=`<div class="dialogtitle"><h2>确认保留同名事件</h2></div><div class="dialogbody">${sameNameWarning()}<p>同名事件仍是独立定义，不会自动合并或替换引用。</p><div class="actions"><button data-ea="cancelworkflow">返回修改名称</button><button class="primary" data-ea="samenamesave">保留同名并继续</button></div></div>`;$('#eventWorkflowDialog').showModal();return true}
function uniqueCopyName(name){let n=1,candidate;do{const suffix=n===1?'（副本）':`（副本 ${n}）`;candidate=name.slice(0,50-suffix.length)+suffix;n++}while(eventGroups().some(g=>g.name===candidate));return candidate}
function eventChangesUI(group,next,name=groupName(group)){
 const before=groupById(group)?.events||[],describe=t=>`${esc(actionLabel(t.action))} · ${esc(timeText(t))}`;
 const added=next.filter(t=>!before.some(e=>targetKey(e)===targetKey(t))),removed=before.filter(e=>!next.some(t=>targetKey(t)===targetKey(e)));
 const changed=next.map(t=>({next:t,old:before.find(e=>targetKey(e)===targetKey(t))})).filter(x=>x.old&&targetConfig(x.old)!==targetConfig(x.next));
 return `<p>确认后，所有引用关系自动使用最新完整事件。</p>${name!==groupName(group)?`<p>事件名称：${esc(groupName(group))} → ${esc(name)}</p>`:''}${added.length?`<p><strong>新增输出</strong><br>${added.map(t=>esc(targetLabel(t))+'：'+describe(t)).join('<br>')}</p>`:''}${removed.length?`<p><strong>移除输出</strong><br>${removed.map(t=>esc(targetLabel(t))+'：'+describe(t)).join('<br>')}</p>`:''}${changed.length?`<div class="change-list"><strong>动作与时间变化</strong>${changed.map(x=>`<p><b>${esc(targetLabel(x.next))}</b><br>修改前：${describe(x.old)}<br>修改后：${describe(x.next)}</p>`).join('')}</div>`:''}<details class="readbox"><summary>修改后完整事件：${esc(name)} · ${next.length} 个输出</summary>${next.map(t=>`<p>${esc(targetLabel(t))}：${describe(t)}</p>`).join('')}</details>`;
}
function eventControlsImpactUI(group,next){const refs=groupReferences([group]),overrides={[group]:next};return refs.map(r=>{const note=outputControlNotice(r,r.device,overrides,new Set(next.map(targetKey)));return note?`<section class="impact-control"><h3>${esc(deviceLabel(dev(r.device)))} / ${esc(r.name)}</h3>${note}</section>`:''}).join('')}
function deletionBlock(ids,whole){
 const items=ids.map(ev).filter(Boolean);if(!items.length)return '配置已不存在。';
 const groups=[...new Set(items.map(e=>e.group))];
 if(!whole&&groups.some(g=>!db.events.some(e=>e.group===g&&!ids.includes(e.id))))return '事件至少需要保留一个输出。如需删除整个事件，请点击事件旁的“编辑”，再使用“删除”处理。';
 if(whole&&(references(ids).length||relationDraftReferences(ids).length))return '请先在以下关系中更换或移除事件引用，再删除整个事件。';
 if(!whole&&items.some(e=>eventDrafts['single:'+e.id]&&eventDraftDirty(eventDrafts['single:'+e.id])))return '待移除的输出还有未保存的单项修改，请先保存或放弃该草稿。';
 return '';
}
function askDeleteEvents(ids,whole=ids.length>1){
 keepEventDraft();ids=ids.map(Number);const items=ids.map(ev).filter(Boolean);if(!items.length)return;
 const block=deletionBlock(ids,whole),refs=references(ids),draftRefs=relationDraftReferences(ids);pendingEventDelete={ids,whole};
 const groups=[...new Set(items.map(e=>e.group))];
 const impact=whole?'':groups.map(g=>{const next=groupById(g).events.filter(e=>!ids.includes(e.id));return eventChangesUI(g,next)+eventControlsImpactUI(g,next)}).join('');
 $('#eventWorkflowDialog').innerHTML=`<div class="dialogtitle"><h2>${block?'暂不能'+(whole?'删除事件':'移除此输出'):whole?'删除整个事件？':'从事件移除此输出？'}</h2></div><div class="dialogbody">${block?`<p role="alert">${esc(block)}</p>`:whole?'<p>删除整个事件及其输出配置，并清除该事件的编辑草稿；删除后可撤销配置。</p>':impact}${refs.length?`<p>影响 ${refs.length} 条已保存关系：</p>${refs.map(r=>`<p>${esc(deviceLabel(dev(r.device)))} / ${esc(r.name)}</p>`).join('')}`:''}${draftRefs.length?`<p>以下未保存关系草稿也引用此事件：</p>${draftRefs.map(r=>`<p>${esc(dev(r.source)?.name||r.source)} / ${esc(r.name)}</p>`).join('')}`:''}${!block&&!whole?'<p>保留事件及关系引用，只移除列出的输出。确认后可撤销。</p>':''}<div class="actions"><button data-ea="cancelworkflow">${block?'知道了':'返回检查'}</button>${block?'':`<button class="primary" data-ea="confirmdeleteevent">${whole?'确认删除整个事件':'确认移除此输出'}</button>`}</div></div>`;
 $('#eventWorkflowDialog').showModal();
}
function deletePendingEvents(){
 if(!pendingEventDelete)return;const {ids,whole}=pendingEventDelete;
 if(deletionBlock(ids,whole)){askDeleteEvents(ids,whole);return}
 const items=ids.map(ev).filter(Boolean),groups=[...new Set(items.map(e=>e.group))];if(!items.length)return;
 db.nextEventId=Math.max(db.nextEventId||1,...db.events.map(e=>e.id+1));
 deletedEvents={events:[...(deletedEvents?.events||[]).filter(e=>!ids.includes(e.id)),...clone(items)],names:{...(deletedEvents?.names||{}),...Object.fromEntries(groups.map(g=>[g,groupName(g)]))}};
 sessionStorage.setItem('iced-deleted-events',JSON.stringify(deletedEvents));db.events=db.events.filter(e=>!ids.includes(e.id));
 for(const group of groups){if(whole)delete eventDrafts['group:'+group];rebaseEventDrafts(group,null)}
 for(const [key,d] of Object.entries(eventDrafts))if(['single','group'].includes(key.split(':')[0])&&!d.memberIds.length&&!d.targets.length)delete eventDrafts[key];
 persistEventDrafts();persist();eventDraft=null;pendingEventDelete=null;$('#eventWorkflowDialog').close();
 openEvent(groupById(groups[0])?groups[0]:db.events[0]?.group||null,null,false);toast(whole?'已删除整个事件，可撤销。':'已从事件移除输出，引用关系已自动更新，可撤销。');
}
function undoEventDeletion(confirmed=false){
 if(!deletedEvents)return;keepEventDraft();
 const items=deletedEvents.events.filter(e=>!ev(e.id)),groups=[...new Set(items.map(e=>e.group))];
 const collision=items.find(e=>db.events.some(x=>x.group===e.group&&targetKey(x)===targetKey(e)));
 if(collision){$('#eventWorkflowDialog').innerHTML=`<div class="dialogtitle"><h2>无法直接恢复此输出</h2></div><div class="dialogbody"><p>${esc(groupName(collision.group))} 已重新配置 ${esc(targetLabel(collision))}。请先核对已有配置，恢复不会覆盖新配置或重复添加同一输出。</p><button data-ea="cancelworkflow">返回检查</button></div>`;$('#eventWorkflowDialog').showModal();return}
 const refs=groupReferences(groups),draftRefs=relationDraftReferences(db.events.filter(e=>groups.includes(e.group)).map(e=>e.id));
 if(!confirmed&&(refs.length||draftRefs.length)){
  $('#eventWorkflowDialog').innerHTML=`<div class="dialogtitle"><h2>确认恢复输出的引用影响</h2></div><div class="dialogbody">${groups.map(g=>{const next=[...(groupById(g)?.events||[]),...items.filter(e=>e.group===g)];return eventChangesUI(g,next)+eventControlsImpactUI(g,next)}).join('')}<p>影响 ${refs.length} 条已保存关系：</p>${refs.map(r=>`<p>${esc(deviceLabel(dev(r.device)))} / ${esc(r.name)}</p>`).join('')}${draftRefs.length?`<p>另有 ${draftRefs.length} 份关系草稿引用此事件，执行范围也将更新。</p>`:''}<div class="actions"><button data-ea="cancelworkflow">取消恢复</button><button class="primary" data-ea="confirmrestore">确认恢复并更新引用</button></div></div>`;$('#eventWorkflowDialog').showModal();return;
 }
 const restoreKey=eventDraft?eventDraftKey():null;
 for(const e of items){db.events.push({...e,name:groupName(e.group)||e.name});if(!db.eventNames[e.group])db.eventNames[e.group]=deletedEvents.names[e.group]}
 persist();for(const group of groups)rebaseEventDrafts(group,null);
 if(restoreKey&&eventDrafts[restoreKey])eventDraft=clone(eventDrafts[restoreKey]);
 deletedEvents=null;sessionStorage.removeItem('iced-deleted-events');if($('#eventWorkflowDialog').open)$('#eventWorkflowDialog').close();renderEvents();toast('已恢复事件配置，引用关系已自动更新。');
}
function deletionNotice(){return deletedEvents?`<div class="draft-notice">已移除或删除 ${deletedEvents.events.length} 个输出配置 <button class="link" data-ea="undodelete">撤销删除 / 移除</button></div>`:''}

