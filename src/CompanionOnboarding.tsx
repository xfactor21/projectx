type Props = { onClose(): void }

const steps = [
  {
    eyebrow: '01 · CLOUD',
    title: 'One account keeps the project list in sync.',
    copy: 'Companion reads your project.X Cloud workspace. Cloud access does not mean your Windows PC is online, so those states are always shown separately.',
  },
  {
    eyebrow: '02 · WINDOWS HOST',
    title: 'Your PC does the local work.',
    copy: 'Launch, Terminal, Build, Git and ZIP imports run on the Windows host. Companion only enables those controls when that PC has checked in recently and the project exists there.',
  },
  {
    eyebrow: '03 · REMOTE CONTROL',
    title: 'Send commands and follow every result.',
    copy: 'Actions move through queued, running and completed states. Send ZIP can also queue while the PC is offline, then continue when project.X reconnects.',
  },
] as const

export default function CompanionOnboarding({ onClose }: Props) {
  return <div className="companion-onboarding-backdrop">
    <section className="companion-onboarding" role="dialog" aria-modal="true" aria-label="Welcome to project.X Companion">
      <header><small>PROJECT.X COMPANION</small><strong>Remote control without the guesswork.</strong></header>
      <div className="companion-onboarding-steps">
        {steps.map((step) => <article key={step.eyebrow}><span>{step.eyebrow}</span><h2>{step.title}</h2><p>{step.copy}</p></article>)}
      </div>
      <footer><button type="button" onClick={onClose}>Enter Companion</button><small>You can reopen this guide from Settings.</small></footer>
    </section>
  </div>
}
