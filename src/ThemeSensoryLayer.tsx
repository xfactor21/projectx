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
function noiseBurst(context: AudioContext, at: number, duration: number, gainValue: number) {
  const length=Math.max(1,Math.floor(context.sampleRate*duration));const buffer=context.createBuffer(1,length,context.sampleRate);const data=buffer.getChannelData(0);for(let index=0;index<length;index+=1)data[index]=(Math.random()*2-1)*(1-index/length);const source=context.createBufferSource();const gain=context.createGain();const filter=context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1450;filter.Q.value=1.9;gain.gain.value=gainValue;source.buffer=buffer;source.connect(filter).connect(gain).connect(context.destination);source.start(at)
}
function playThemeCue(context: AudioContext, theme: ThemeMode) {
  const now=context.currentTime+.015
  if(theme==='Storefront'){tone(context,880,now,.52,.06);tone(context,1320,now+.13,.72,.045);tone(context,1760,now+.26,.55,.028);return}
  if(theme==='Vending'){tone(context,190,now,.08,.045,'square');tone(context,640,now+.09,.11,.05,'square');tone(context,980,now+.2,.13,.045,'square');return}
  if(theme==='Comic'){noiseBurst(context,now,.09,.025);tone(context,160,now,.12,.065,'sawtooth');tone(context,330,now+.045,.16,.035,'square');return}
  if(theme==='XFactor'){noiseBurst(context,now,.07,.018);tone(context,72,now,.62,.032,'sawtooth');tone(context,522,now+.055,.11,.028,'square');tone(context,784,now+.16,.1,.022,'square');tone(context,1046,now+.27,.18,.013,'sine');return}
  if(theme==='PlanetX'){tone(context,65.4,now,1.65,.018);tone(context,130.8,now+.06,1.42,.017);tone(context,261.6,now+.18,1.05,.013);tone(context,659.3,now+.42,.78,.009);return}
  if(theme==='3D'){tone(context,110,now,1.15,.035);tone(context,220,now+.04,1.4,.025);tone(context,440,now+.18,.9,.018);return}
  tone(context,440,now,.07,.04,'square');tone(context,760,now+.075,.08,.025)
}
export default function ThemeSensoryLayer(){
  const[enabled,setEnabled]=useState(readEnabled);const audioRef=useRef<AudioContext|null>(null)
  async function ensureAudio(){if(!audioRef.current)audioRef.current=new AudioContext();if(audioRef.current.state==='suspended')await audioRef.current.resume();return audioRef.current}
  useEffect(()=>{const handler=(event:Event)=>{if(!enabled)return;const theme=normalizeTheme((event as CustomEvent<string>).detail);void ensureAudio().then((context)=>playThemeCue(context,theme));if('vibrate'in navigator&&(theme==='Vending'||theme==='Comic'||theme==='XFactor'))navigator.vibrate?.(theme==='Comic'?[18,18,28]:theme==='XFactor'?[12,20,12]:20)};window.addEventListener('projectx:theme-changed',handler);return()=>window.removeEventListener('projectx:theme-changed',handler)},[enabled])
  async function toggle(){const next=!enabled;setEnabled(next);localStorage.setItem(SOUND_KEY,next?'on':'off');if(next){const context=await ensureAudio();playThemeCue(context,normalizeTheme(localStorage.getItem('projectx.view.v1')))}}
  return <button type="button" className={`theme-sound-toggle ${enabled?'on':''}`} onClick={()=>void toggle()} title="Theme sounds"><span>{enabled?'◉':'○'}</span><strong>SOUND</strong></button>
}
