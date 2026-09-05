import { useEffect, useRef, useState } from 'react'

const SOUND_KEY = 'projectx.theme.sound.v1'
type ThemeMode = 'Grid' | 'Storefront' | 'Vending' | 'Comic' | '3D' | 'XFactor' | 'PlanetX'

function normalizeTheme(value: string | null): ThemeMode {
  if (value === 'Neon') return 'XFactor'
  if (value === 'Orbit') return 'PlanetX'
  return (value || 'Grid') as ThemeMode
}

function readEnabled() { return localStorage.getItem(SOUND_KEY) === 'on' }
function tone(context: AudioContext, frequency: number, at: number, duration: number, gainValue: number, type: OscillatorType = 'sine') {
  const oscillator=context.createOscillator();const gain=context.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(gainValue,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);oscillator.connect(gain).connect(context.destination);oscillator.start(at);oscillator.stop(at+duration+.03)
}
function noiseBurst(context: AudioContext, at: number, duration: number, gainValue: number, frequency=1450) {
  const length=Math.max(1,Math.floor(context.sampleRate*duration));const buffer=context.createBuffer(1,length,context.sampleRate);const data=buffer.getChannelData(0);for(let index=0;index<length;index+=1)data[index]=(Math.random()*2-1)*(1-index/length);const source=context.createBufferSource();const gain=context.createGain();const filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=1.9;gain.gain.value=gainValue;source.buffer=buffer;source.connect(filter).connect(gain).connect(context.destination);source.start(at)
}
function playThemeCue(context: AudioContext, theme: ThemeMode) {
  const now=context.currentTime+.015
  if(theme==='Storefront'){tone(context,880,now,.32,.035);tone(context,1320,now+.12,.4,.025);tone(context,1760,now+.24,.3,.018);return}
  if(theme==='Vending'){tone(context,190,now,.08,.035,'square');tone(context,640,now+.09,.11,.04,'square');tone(context,980,now+.2,.13,.03,'square');return}
  if(theme==='Comic'){noiseBurst(context,now,.09,.02,1000);tone(context,160,now,.12,.045,'sawtooth');tone(context,330,now+.045,.16,.028,'square');return}
  if(theme==='XFactor'){noiseBurst(context,now,.07,.015,1800);tone(context,72,now,.62,.025,'sawtooth');tone(context,522,now+.055,.11,.022,'square');tone(context,784,now+.16,.1,.018,'square');tone(context,1046,now+.27,.18,.011);return}
  if(theme==='PlanetX'){tone(context,65.4,now,1.65,.014);tone(context,130.8,now+.06,1.42,.012);tone(context,261.6,now+.18,1.05,.01);tone(context,659.3,now+.42,.78,.007);return}
  if(theme==='3D'){tone(context,110,now,1.15,.024);tone(context,220,now+.04,1.4,.018);tone(context,440,now+.18,.9,.012);return}
  tone(context,220,now,.22,.018,'sine');tone(context,440,now+.09,.16,.014,'square');tone(context,760,now+.17,.08,.01)
}
function playAmbientMoment(context: AudioContext, theme: ThemeMode) {
  const now=context.currentTime+.01
  if(theme==='Storefront'){
    const pick=Math.random()
    noiseBurst(context,now,.65,.006,260)
    if(pick<.28){tone(context,410,now+.12,.16,.012,'square');tone(context,350,now+.19,.18,.009,'square')}
    else if(pick<.52){tone(context,1568,now+.06,.16,.012);tone(context,2093,now+.16,.24,.008)}
    else if(pick<.68){tone(context,1046,now+.04,.16,.008);tone(context,1318,now+.18,.22,.006)}
    return
  }
  if(theme==='Vending'){
    tone(context,92,now,.9,.007,'square');if(Math.random()<.55){tone(context,740,now+.18,.08,.012,'square');tone(context,980,now+.31,.09,.009,'square')};return
  }
  if(theme==='Comic'){
    if(Math.random()<.5)noiseBurst(context,now,.12,.01,900);else{tone(context,240,now,.08,.018,'square');tone(context,360,now+.08,.1,.012,'square')};return
  }
  if(theme==='3D'){
    tone(context,74,now,1.8,.006);if(Math.random()<.5)tone(context,1174,now+.3,.55,.005);return
  }
  if(theme==='XFactor'){
    noiseBurst(context,now,.09,.006,2200);tone(context,58,now,.75,.008,'sawtooth');if(Math.random()<.45)tone(context,932,now+.14,.08,.009,'square');return
  }
  if(theme==='PlanetX'){
    tone(context,55,now,2.2,.006);tone(context,110,now+.08,1.8,.005);if(Math.random()<.5)tone(context,880,now+.65,.7,.004);return
  }
  tone(context,96,now,1.2,.005);if(Math.random()<.55){tone(context,520,now+.16,.05,.008,'square');tone(context,690,now+.31,.05,.006,'square')}
}

export default function ThemeSensoryLayer(){
  const[enabled,setEnabled]=useState(readEnabled);const[theme,setTheme]=useState<ThemeMode>(()=>normalizeTheme(localStorage.getItem('projectx.view.v1')));const audioRef=useRef<AudioContext|null>(null)
  async function ensureAudio(){if(!audioRef.current)audioRef.current=new AudioContext();if(audioRef.current.state==='suspended')await audioRef.current.resume();return audioRef.current}
  useEffect(()=>{const handler=(event:Event)=>{const next=normalizeTheme((event as CustomEvent<string>).detail);setTheme(next);if(!enabled)return;void ensureAudio().then((context)=>playThemeCue(context,next));if('vibrate'in navigator&&(next==='Vending'||next==='Comic'||next==='XFactor'))navigator.vibrate?.(next==='Comic'?[18,18,28]:next==='XFactor'?[12,20,12]:20)};window.addEventListener('projectx:theme-changed',handler);return()=>window.removeEventListener('projectx:theme-changed',handler)},[enabled])
  useEffect(()=>{if(!enabled)return;let stopped=false;let timer:number|undefined;const schedule=()=>{if(stopped)return;timer=window.setTimeout(()=>{void ensureAudio().then((context)=>playAmbientMoment(context,theme)).catch(()=>undefined);schedule()},6500+Math.random()*6500)};schedule();return()=>{stopped=true;if(timer)window.clearTimeout(timer)}},[enabled,theme])
  async function toggle(){const next=!enabled;setEnabled(next);localStorage.setItem(SOUND_KEY,next?'on':'off');if(next){const context=await ensureAudio();playThemeCue(context,theme)}}
  return <button type="button" className={`theme-sound-toggle ${enabled?'on':''}`} onClick={()=>void toggle()} title="Theme sounds and ambience"><span>{enabled?'◉':'○'}</span><strong>SOUND</strong></button>
}
