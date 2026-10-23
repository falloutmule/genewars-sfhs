"""Fail closed on private/binary artifacts and embedded original assets in public source."""
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BLOCKED = {'.exe','.dll','.anb','.pal','.spe','.smk','.wav','.mp3','.ogg','.dat','.bin','.gwpack','.zip','.7z','.img','.iso','.gpr','.png','.jpg','.jpeg','.gif','.webp','.bmp'}
PRIVATE_PARTS = {'.private','dist','node_modules','test-results','playwright-report','.git','__pycache__'}
ALLOW = {'.ts','.mjs','.json','.md','.py','.ps1','.html','.css','.yml','.yaml','.txt','.gitignore','.gitattributes'}
SECRET = re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)')


def check_file(path, known=None):
    problems=[]
    if path.suffix.lower() in BLOCKED:
        return ['binary/original asset extension: '+path.name]
    data=path.read_bytes()
    if b'\0' in data or data.startswith((b'MZ',b'RNC',b'RIFF',b'\x89PNG')):
        problems.append('binary content: '+path.name)
    if known and hashlib.sha256(data).hexdigest() in known:
        problems.append('matches private source hash: '+path.name)
    if SECRET.search(data):
        problems.append('credential pattern: '+path.name)
    if re.search(rb'[A-Z]:[\\/]+Users[\\/]+[a-z0-9_.-]+',data,re.I):
        problems.append('personal absolute path: '+path.name)
    # Examples may contain short URI prefixes; actual encoded images/audio are forbidden.
    if re.search(rb'data:(?:image|audio)/[^,\s]+;base64,[A-Za-z0-9+/=]{80,}',data):
        problems.append('embedded image/audio: '+path.name)
    if len(data)>2*1024*1024:
        problems.append('unexpected public file over 2 MiB: '+path.name)
    return problems


def main():
    command=['git','-c','safe.directory='+str(ROOT).replace('\\','/'),'-C',str(ROOT)]
    tracked=subprocess.check_output(command+['ls-files','-z']).decode().split('\0')
    failures=[]
    for name in filter(None,tracked):
        p=Path(name)
        if any(part in PRIVATE_PARTS for part in p.parts):
            failures.append('private/generated path tracked: '+name)
    known=set()
    private=ROOT/'.private/imported/genewars.gwpack'
    if private.exists():
        pack=json.loads(gzip.decompress(private.read_bytes()))
        known={r['sha256'] for r in pack['manifest']}
        for a in pack['assets'].values():
            known.add(hashlib.sha256(base64.b64decode(a['image'].split(',')[1])).hexdigest())
    files=[]
    def walk(parent):
        for p in parent.iterdir():
            if p.is_symlink():
                failures.append('public symlink: '+str(p.relative_to(ROOT)))
            elif p.is_dir():
                if p.name not in PRIVATE_PARTS:walk(p)
            elif p.is_file():
                files.append(p)
    walk(ROOT)
    for p in files:failures.extend(check_file(p,known))
    if not (ROOT/'LICENSE').read_text().find('Apache License')>=0 or '39d6f587' not in (ROOT/'NOTICE').read_text():
        failures.append('license or upstream notice missing')
    print(json.dumps({'status':'fail' if failures else 'pass','publicFilesScanned':len(files),'trackedFiles':len(list(filter(None,tracked))),'privateHashesCompared':len(known),'failures':failures},indent=2))
    return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
