from pathlib import Path
import re


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'missing expected text in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# Mobile approval must prove it is the device that requested the action.
p = Path('src/CompanionApp.tsx')
text = p.read_text(encoding='utf-8')
text, count = re.subn(
    r"await updateRemoteAction\(action\.id, 'approved'\)",
    "await updateRemoteAction(action.id, 'approved', undefined, deviceId())",
    text,
)
if count < 2:
    raise SystemExit(f'expected at least two mobile approval calls, found {count}')
p.write_text(text, encoding='utf-8')

# Windows execution transitions must prove the target desktop device identity.
p = Path('src/CompanionDesktopWorker.tsx')
text = p.read_text(encoding='utf-8')
text = text.replace("await updateRemoteAction(action.id, 'running')", "await updateRemoteAction(action.id, 'running', undefined, desktopDeviceId())")
text = re.sub(
    r"await updateRemoteAction\(action\.id, 'running', (\{[^\n]*\})\)",
    r"await updateRemoteAction(action.id, 'running', \1, desktopDeviceId())",
    text,
)
text = re.sub(
    r"await updateRemoteAction\(action\.id, 'succeeded', (\{[^\n]*\})\)",
    r"await updateRemoteAction(action.id, 'succeeded', \1, desktopDeviceId())",
    text,
)
text = re.sub(
    r"await updateRemoteAction\(action\.id, 'failed', (\{[^\n]*\})\)",
    r"await updateRemoteAction(action.id, 'failed', \1, desktopDeviceId())",
    text,
)
old = "publishHostStatus('connecting', `Synced ${synced.count} project records.`, synced.count)"
new = "publishHostStatus('connecting', synced.conflicts.length ? `Synced ${synced.count} project records; ${synced.conflicts.length} conflict${synced.conflicts.length === 1 ? '' : 's'} need review.` : `Synced ${synced.count} project records${synced.deletedCount ? `; removed ${synced.deletedCount} stale cloud record${synced.deletedCount === 1 ? '' : 's'}` : ''}.`, synced.count)"
if old not in text:
    raise SystemExit('missing cloud sync status line')
text = text.replace(old, new)
p.write_text(text, encoding='utf-8')
