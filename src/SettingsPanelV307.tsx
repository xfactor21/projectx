import { useEffect,useRef,useState } from 'react'
import SupabaseSetup from './SupabaseSetup'
import { APP_VERSION } from './version'
import { getSupabaseConfig,isSelfHostingEnabled,isSupabaseConfigured,loadSession,setSelfHostingEnabled } from './services/supabase'
import { readSettings,saveSettings } from './services/settings'
import { getDesktopHost } from './services/desktop'
import type { AppSettings } from './services/settings'

type Tab='general'|'cloud'|'runtime'|'data'|'about'
const tabs:{id:Tab;icon:string;label:string;hint:string}[]=[
  {id:'general',icon:'✦',label:'Experience',hint:'Appearance and behavior'},
  {id:'cloud',icon:'☁',label:'Connections',hint:'Cloud and Companion'},
  {id:'runtime',icon:'▶',label:'Development',hint:'Runtimes and tasks'},
  {id:'data',icon:'▣',label:'Workspace data',hint:'Backup and diagnostics'},
  {id:'about',icon:'X',label:'About',hint:'Version and system state'},
]
function utility(category:'projects'|'cloud'|'system',selector?:string){window.dispatchEvent(new CustomEvent('projectx:open-utility',{detail:{category}}));if(selector)window.setTimeout(()=>document.querySelector<HTMLButtonElement>(selector)?.click(),80)}

function Toggle({title,copy,checked,onChange}:{title:string;copy:string;checked:boolean;onChange(value:boolean):void}){
  return <label className="settings-choice"><span><strong>{title}</strong><small>{copy}</small></span><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/><i aria-hidden="true"/></label>
}
function Action({icon,title,copy,onClick,disabled=false}:{icon:string;title:string;copy:string;onClick():void;disabled?:boolean}){
  return <button className="settings-action-card" type="button" disabled={disabled} onClick={onClick}><i>{icon}</i><span><strong>{title}</strong><small>{copy}</small></span><b>→</b></button>
}

export default function SettingsPanelV307(){
  const[open,setOpen]=useState(false),[tab,setTab]=useState<Tab>('general'),[settings,setSettings]=useState<AppSettings>(readSettings),[,refresh]=useState(0)
  const closeRef=useRef<HTMLButtonElement>(null),cloud=getSupabaseConfig()
  useEffect(()=>{const show=(event:Event)=>{const requested=(event as CustomEvent<{tab?:Tab}>).detail?.tab;setSettings(readSettings());if(requested)setTab(requested);setOpen(true)};window.addEventListener('projectx:open-settings',show);return()=>window.removeEventListener('projectx:open-settings',show)},[])
  useEffect(()=>{if(!open)return;closeRef.current?.focus();const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[open])
  const update=<K extends keyof AppSettings>(key:K,value:AppSettings[K])=>{const next={...settings,[key]:value};setSettings(next);saveSettings(next)}
  const launch=(category:'projects'|'cloud'|'system',selector?:string)=>{setOpen(false);utility(category,selector)}
  if(!open)return null
  return <div className="settings-backdrop settings-v307" onMouseDown={()=>setOpen(false)}><section className="settings-workspace" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={event=>event.stopPropagation()}>
    <header><div><small>PROJECT.X CONTROL</small><strong id="settings-title">Settings</strong><span>Shape the workspace around how you build.</span></div><button ref={closeRef} type="button" onClick={()=>setOpen(false)} aria-label="Close settings">×</button></header>
    <div className="settings-layout"><nav aria-label="Settings sections">{tabs.map(item=><button key={item.id} className={tab===item.id?'active':''} type="button" onClick={()=>setTab(item.id)}><i>{item.icon}</i><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</nav>
      <main className="settings-content">
        {tab==='general'&&<><div className="settings-heading"><small>EXPERIENCE</small><h2>Make project.X feel right.</h2><p>These preferences apply immediately and stay on this device.</p></div><div className="settings-choice-grid"><Toggle title="Open preview after Run" copy="Show the verified local project inside project.X." checked={settings.autoOpenPreview} onChange={value=>update('autoOpenPreview',value)}/><Toggle title="Launch splash" copy="Show the planet.X introduction while the desktop starts." checked={settings.showLaunchSplash} onChange={value=>update('showLaunchSplash',value)}/><Toggle title="Reduced motion" copy="Pause decorative movement while preserving status feedback." checked={settings.reduceMotion} onChange={value=>update('reduceMotion',value)}/><Toggle title="Environment audio" copy="Enable restrained theme ambience and interaction cues." checked={settings.themeAudio} onChange={value=>update('themeAudio',value)}/></div></>}
        {tab==='cloud'&&<><div className="settings-heading"><small>CONNECTIONS</small><h2>One account, every device.</h2><p>{cloud.source==='managed'?(loadSession()?'Signed in and ready to sync.':'Managed cloud is ready for sign in.'):cloud.source==='self-hosted'?'Using a custom backend on this device.':'Cloud is unavailable in this build.'}</p></div><div className="settings-status-card"><i className={isSupabaseConfigured()?'ready':''}/><span><strong>{cloud.source==='managed'?'Managed project.X Cloud':cloud.source==='self-hosted'?'Self-hosted cloud':'Cloud unavailable'}</strong><small>{loadSession()?'Account session active':'No active account session'}</small></span></div><div className="settings-action-grid"><Action icon="☁" title="Account and cloud sync" copy="Manage sign-in, sync, and connection status." disabled={!isSupabaseConfigured()} onClick={()=>launch('cloud','.cloud-dock-toggle')}/><Action icon="⌁" title="Companion connection" copy="Review the Windows and Android link." onClick={()=>{setOpen(false);window.dispatchEvent(new CustomEvent('projectx:open-connection',{detail:{provider:'companion'}}))}}/></div><details className="self-hosting-settings" open={isSelfHostingEnabled()}><summary>Advanced self-hosting</summary><p>Use a custom Supabase project instead of the managed service.</p><Toggle title="Use a self-hosted backend" copy="For administrators and source deployments." checked={isSelfHostingEnabled()} onChange={value=>{setSelfHostingEnabled(value);refresh(n=>n+1)}}/>{isSelfHostingEnabled()&&<SupabaseSetup onSaved={()=>refresh(n=>n+1)}/>}</details></>}
        {tab==='runtime'&&<><div className="settings-heading"><small>DEVELOPMENT</small><h2>Run and inspect projects.</h2><p>Servers started by project.X remain owned, observable, and safely stoppable.</p></div><div className="settings-action-grid"><Action icon="⌘" title="Runtime inspector" copy="Check Node, package managers, and toolchains." onClick={()=>launch('system','.runtime-dock-toggle')}/><Action icon="▶" title="Running tasks" copy="Open previews, restart, or stop active projects." onClick={()=>launch('projects','.task-console-toggle')}/></div><div className="settings-note"><strong>Phone previews</strong><p>Mobile launches now require a verified LAN binding before project.X reports success. Windows Firewall and both devices being on the same Wi-Fi still apply.</p></div></>}
        {tab==='data'&&<><div className="settings-heading"><small>WORKSPACE DATA</small><h2>Your projects stay portable.</h2><p>Back up project records and verify the workspace without requiring cloud access.</p></div><div className="settings-action-grid"><Action icon="⇩" title="Backup and restore" copy="Export or restore project.X workspace data." onClick={()=>launch('system','.data-backup-toggle')}/><Action icon="✓" title="Diagnostics" copy="Check storage, environment, and integration health." onClick={()=>launch('system','.beta-toggle')}/></div></>}
        {tab==='about'&&<><div className="settings-heading"><small>ABOUT</small><h2>project.X <em>v{APP_VERSION}</em></h2><p>A living developer workspace created at planet.X.</p></div><div className="settings-about-grid"><span><i>PC</i><small>Desktop host</small><b>{getDesktopHost()?'ONLINE':'WEB MODE'}</b></span><span><i>☁</i><small>Cloud</small><b>{isSupabaseConfigured()?cloud.source.toUpperCase():'UNAVAILABLE'}</b></span><span><i>◎</i><small>Account</small><b>{loadSession()?'SIGNED IN':'SIGNED OUT'}</b></span></div></>}
      </main>
    </div>
  </section></div>
}
