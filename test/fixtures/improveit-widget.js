/* ImproveIt.now embed. No page contents, form values, errors, or URL parameters are collected. */
(()=>{
 'use strict';
 const script=document.currentScript;
 if(!script||window.ImproveIt!==undefined||document.querySelector('[data-improveit-host]'))return;
 const endpoint=new URL(script.src).origin;
 if(location.origin===endpoint&&/^\/widget\/?$/.test(location.pathname))return;
 const app=script.dataset.app,space=script.dataset.space;
 if(!app||!space)return;
 const ru=script.dataset.lang==='ru';
 const hiddenLauncher=script.dataset.launcher==='hidden';
 const rawColor=script.dataset.color;
 let color,foreground;
 if(typeof rawColor==='string'&&/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(rawColor)){
  color='#'+(rawColor.length===4?[...rawColor.slice(1)].map(c=>c+c).join(''):rawColor.slice(1)).toLowerCase();
  const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  const luminance=0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
  foreground=(luminance+0.05)/0.05>=1.05/(luminance+0.05)?'#000000':'#ffffff';
 }
 const host=document.createElement('div');host.dataset.improveitHost='';
 const root=host.attachShadow({mode:'closed'});
 const style=document.createElement('style');style.textContent=`:host{all:initial;--dialog-background:#fff;--dialog-border:#d9e1ce;--bar-background:#344538;--bar-foreground:#edf4e4;--close-foreground:#edf4e4;--bar-border:#dce5cf}button{font:600 13px system-ui;cursor:pointer}.launcher{position:fixed;bottom:var(--improveit-launcher-bottom,24px);${script.dataset.position==='left'?'left':'right'}:24px;z-index:2147483000;display:inline-flex;align-items:center;gap:10px;min-height:48px;box-sizing:border-box;background:${color||'var(--launcher-background,#eff7dc)'};color:${foreground||'var(--launcher-foreground,#202c2a)'};border:1px solid var(--launcher-border,#788d63);border-radius:50px;padding:8px 16px 8px 10px;box-shadow:0 4px 16px #17291820}.launcher[hidden]{display:none}.launcher svg{width:28px;height:28px;flex:none;color:var(--launcher-mark,#d4ef83)}.launcher:hover{filter:brightness(.96)}:host([data-improveit-theme='dark']){--launcher-background:#344538;--launcher-foreground:#e2edcf;--launcher-border:#82976c;--launcher-mark:#b4cb83;--dialog-background:#1c2923;--dialog-border:#465644;--bar-background:#142019;--bar-foreground:#edf4e4;--close-foreground:#edf4e4;--bar-border:#3e5041}.launcher:focus-visible{outline:3px solid ${foreground||'var(--launcher-foreground,#202c2a)'};outline-offset:-4px}.close:focus-visible,.brand-link:focus-visible{outline:3px solid var(--bar-foreground);outline-offset:-3px;border-radius:6px}dialog{padding:0;border:1px solid var(--dialog-border);border-radius:15px;position:fixed;inset:auto 20px 80px auto;margin:0;width:420px;height:min(680px,calc(100dvh - 110px));max-width:calc(100vw - 30px);max-height:calc(100dvh - 35px);overflow:hidden;box-shadow:0 25px 90px #18351c40;background:var(--dialog-background);color-scheme:light}dialog::backdrop{background:#15221b50}:host([data-improveit-theme='dark']) dialog{color-scheme:dark}.bar{height:48px;box-sizing:border-box;border-bottom:1px solid var(--bar-border);background:var(--bar-background);display:flex;justify-content:space-between;align-items:center;padding:0 7px 0 10px;font:600 13px system-ui;color:var(--bar-foreground)}.brand-link{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 6px;color:inherit;text-decoration:none}.brand-link svg{width:23px;height:23px;flex:none}.brand-link .outbound{font:12px system-ui;color:#c6d5b8}.close{font:24px system-ui;border:0;background:none;color:var(--close-foreground);padding:0;min-width:44px;min-height:44px}iframe{border:0;width:100%;height:calc(100% - 48px);display:block}@media(max-width:480px){dialog{inset:12px;max-width:none;width:auto;height:calc(100dvh - 24px);max-height:none}.launcher{bottom:var(--improveit-launcher-bottom,18px);${script.dataset.position==='left'?'left':'right'}:18px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}`;
 const button=document.createElement('button');button.className='launcher';button.type='button';button.hidden=hiddenLauncher;button.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="18" fill="currentColor"/><path d="M18 46 46 18M20 18h26v26" fill="none" stroke="#202c2a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';const label=document.createElement('span');label.textContent=script.dataset.label||(ru?'Улучшить':'Improve it');button.append(label);button.setAttribute('aria-haspopup','dialog');
 const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',ru?'Предложить улучшение':'Suggest an improvement');
 if(typeof dialog.showModal!=='function')return;
 // One host preference controls the launcher, shell, and iframe. An explicit
 // embed setting wins; otherwise follow host toggles before falling back to OS.
 const themeQuery=window.matchMedia?.('(prefers-color-scheme: dark)');
 let returnFocus=null,generation=0,frameReady=false,backdropGesture=null,themeRevision=0;
 let publishTheme=()=>{};
 const singleScheme=element=>{
  const schemes=(window.getComputedStyle?.(element).colorScheme||'').split(/\s+/);
  const light=schemes.includes('light'),dark=schemes.includes('dark');
  return light!==dark?(dark?'dark':'light'):null;
 };
 const resolveTheme=()=>{
  if(script.dataset.theme==='light'||script.dataset.theme==='dark')return script.dataset.theme;
  const elements=[document.body,document.documentElement];
  for(const element of elements){
   const preference=element.dataset?.theme||element.dataset?.themeMode;
   if(preference==='light'||preference==='dark')return preference;
   if(element.classList?.contains('ion-palette-dark')||element.classList?.contains('dark'))return 'dark';
   if(element.classList?.contains('light'))return 'light';
  }
  return singleScheme(document.body)||singleScheme(document.documentElement)||(themeQuery?.matches?'dark':'light');
 };
 const updateTheme=()=>{
  const theme=resolveTheme();
  if(host.dataset.improveitTheme===theme)return;
  host.dataset.improveitTheme=theme;
  themeRevision++;
  publishTheme();
 };
 updateTheme();themeQuery?.addEventListener('change',updateTheme);
 if(window.MutationObserver){
  const observer=new window.MutationObserver(updateTheme);
  for(const element of [document.documentElement,document.body])observer.observe(element,{attributes:true,attributeFilter:['class','style','data-theme','data-theme-mode']});
  observer.observe(script,{attributes:true,attributeFilter:['data-theme']});
 }
 const bar=document.createElement('div');bar.className='bar';const title=document.createElement('a');title.className='brand-link';title.href='https://improveit.now/';title.target='_blank';title.rel='noopener noreferrer';title.referrerPolicy='no-referrer';title.setAttribute('referrerpolicy','no-referrer');title.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="18" fill="#d4ef83"/><path d="M18 46 46 18M20 18h26v26" fill="none" stroke="#24332e" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>ImproveIt.now</span><span class="outbound" aria-hidden="true">↗</span>';const close=document.createElement('button');close.className='close';close.textContent='×';close.type='button';close.setAttribute('aria-label',ru?'Закрыть':'Close');bar.append(title,close);
 const frame=document.createElement('iframe');frame.title=ru?'Обратная связь':'Product feedback';frame.referrerPolicy='no-referrer';frame.allow='';
 const url=new URL('/widget',endpoint);url.searchParams.set('app',app);url.searchParams.set('space',space);if(ru)url.searchParams.set('lang','ru');if(script.dataset.screen)url.searchParams.set('screen',script.dataset.screen.slice(0,80));
 const themeMessage=()=>({generation,theme:host.dataset.improveitTheme,themeRevision});
 const initializeFrame=()=>frame.contentWindow.postMessage({type:'improveit:init',...themeMessage()},endpoint);
 publishTheme=()=>{if(frameReady&&dialog.open)frame.contentWindow.postMessage({type:'improveit:theme',...themeMessage()},endpoint);};
 window.addEventListener('message',event=>{
  if(event.origin!==endpoint||!frame.contentWindow||event.source!==frame.contentWindow||!frame.src)return;
  if(event.data?.type==='improveit:ready'){frameReady=true;if(dialog.open)initializeFrame();}
  if(event.data?.type==='improveit:close'&&dialog.open&&generation>0&&event.data.generation===generation)closeWidget();
 });
 dialog.append(bar);root.append(style,button,dialog);document.body.append(host);
 // WebKit applies no-referrer to first navigation when src is set while detached.
 // Keep this frame attached after closing so reopening preserves its draft.
 const open=()=>{if(dialog.open||generation===Number.MAX_SAFE_INTEGER)return;returnFocus=document.activeElement===host?button:document.activeElement;generation++;if(!frame.src){url.searchParams.set('theme',host.dataset.improveitTheme);frame.src=url.toString();dialog.append(frame);}dialog.showModal();if(frameReady)initializeFrame();close.focus();};
 const closeWidget=()=>{backdropGesture=null;if(dialog.open)dialog.close();};
 // Backdrop events target the dialog too; require both ends of a real primary
 // gesture outside its bounds so dragging a selection out cannot dismiss it.
 const outsideDialog=event=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
 dialog.addEventListener('pointerdown',event=>{backdropGesture=event.isTrusted&&event.isPrimary&&event.button===0&&event.target===dialog&&outsideDialog(event)?{id:event.pointerId,released:false}:null;});
 dialog.addEventListener('pointerup',event=>{if(backdropGesture?.id===event.pointerId&&event.isTrusted&&event.isPrimary&&event.button===0&&event.target===dialog&&outsideDialog(event))backdropGesture.released=true;else backdropGesture=null;});
 dialog.addEventListener('pointercancel',()=>{backdropGesture=null;});
 dialog.addEventListener('cancel',()=>{backdropGesture=null;});
 dialog.addEventListener('click',event=>{const dismiss=backdropGesture?.released&&event.isTrusted&&event.target===dialog&&outsideDialog(event);backdropGesture=null;if(dismiss){event.preventDefault();event.stopPropagation();closeWidget();}});
 button.addEventListener('click',open);close.addEventListener('click',closeWidget);
 dialog.addEventListener('close',()=>{backdropGesture=null;const target=returnFocus?.isConnected&&!returnFocus.hidden&&returnFocus!==document.body&&returnFocus!==document.documentElement?returnFocus:!button.hidden?button:null;target?.focus();});
 window.ImproveIt=Object.freeze({open,close:closeWidget,sourceScript:script,appID:app,spaceID:space});
})();
