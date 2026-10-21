"""Patch the demo session page to add a report link after diagnosis submission.
Run from backend or project root: python <path to this script>
Optional: --project-root <path to trail1>
"""
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--project-root', type=Path, default=Path.cwd())
args = parser.parse_args()
root = args.project_root.resolve()
if root.name == 'backend':
    root = root.parent
page = root / 'frontend' / 'app' / 'session' / '[caseId]' / 'page.tsx'
if not page.exists():
    raise SystemExit(f'ERROR: Page missing: {page}. Use --project-root to point to trail1.')
text = page.read_text(encoding='utf-8')
needle = '''                <a
                  href="/cases"
                  className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#72ded2] px-5 py-3 text-sm font-bold text-[#07333b]"
                >'''
replacement = '''                <a
                  href={`/report/${encodeURIComponent(sessionId)}`}
                  className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#72ded2] px-5 py-3 text-sm font-bold text-[#07333b]"
                >
                  View Clinical Evaluation Report
                </a>

                <a
                  href="/cases"
                  className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-[#72ded2] px-5 py-3 text-sm font-bold text-[#07333b]"
                >'''
if 'View Clinical Evaluation Report' in text:
    print('Already patched; nothing changed.')
elif text.count(needle) != 1:
    raise SystemExit('ERROR: Could not find expected Back to cases button exactly once. No changes made. Send current page.tsx for custom patch.')
else:
    backup = page.with_name('page.tsx.before_report_link.bak')
    backup.write_text(text, encoding='utf-8')
    page.write_text(text.replace(needle, replacement), encoding='utf-8')
    print('Patched:', page)
    print('Backup:', backup)
