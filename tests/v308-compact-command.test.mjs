import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(path,'utf8')
const workspace=read('src/WorkspaceAppV3.tsx')
const renderer=read('src/ThemeProjectRendererV307.tsx')
const css=read('src/experienceV308.css')
const main=read('src/main.tsx')

test('v3.08 uses a thin invisible utility header with only core actions',()=>{
  assert.match(workspace,/invisible-utility-header/)
  assert.match(workspace,/Your project universe./)
  assert.match(workspace,/Search projects…/)
  assert.match(workspace,/>\+ Project</)
  assert.match(workspace,/https:\/\/planet-x\.co\/store/)
  assert.doesNotMatch(workspace,/workspace-status-live/)
})

test('counts precede project heading and environments remain an accessible Beta popup',()=>{
  const counts=workspace.indexOf('compact-count-bar')
  const heading=workspace.indexOf('compact-project-heading')
  assert.ok(counts>=0 && heading>counts)
  assert.match(workspace,/Environments <b>β<\/b>/)
  assert.match(workspace,/setThemePickerOpen\(true\)/)
})

test('Command view is a compact two-column grid without duplicate world heading',()=>{
  assert.doesNotMatch(renderer,/Title detail="COMMAND">PROJECTS/)
  assert.match(css,/command-project-grid[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(css,/min-height:176px/)
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;[\s\S]*margin-top:auto/)
})

test('v3.08 overlays and status feedback are contained',()=>{
  assert.match(css,/utility-menu[\s\S]*width:min\(650px/)
  assert.match(css,/workspace-status-toast/)
  assert.match(workspace,/setTimeout\(\(\)=>setStatus\(''\),7000\)/)
})

test('v3.08 stylesheet is the final experience layer',()=>{
  const v307=main.indexOf("import './experienceV307.css'")
  const v308=main.indexOf("import './experienceV308.css'")
  assert.ok(v308>v307)
})
