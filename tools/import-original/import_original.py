"""Build a private, reproducible normalized content pack from user-owned files."""
import argparse
import base64
import gzip
import json
import struct
import os
import tempfile
from pathlib import Path
import importlib.util
from sources import Source, digest, sha

spec = importlib.util.spec_from_file_location('gw_codecs', Path(__file__).with_name('codecs.py'))
codec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)
ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.1.0'
KNOWN_EXE = '4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba'


def private_output(path):
    path = Path(path).resolve()
    if not path.is_relative_to((ROOT / '.private').resolve()):
        raise ValueError('imported output must be beneath this repository .private/')
    path.mkdir(parents=True, exist_ok=True)
    return path


def uri(data, mime):
    return 'data:'+mime+';base64,'+base64.b64encode(data).decode('ascii')


def atomic_private_write(path, data):
    if path.is_symlink():
        raise ValueError('refusing to replace a symlink output')
    handle, name = tempfile.mkstemp(dir=path.parent, prefix=path.name+'.', suffix='.tmp')
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def run(source_path, out_path):
    out = private_output(out_path)
    source = Source(source_path)
    manifest, unknown, assets, missions, sounds = [], [], {}, [], {}
    try:
        executable = source.find('GW.EXE')
        exe_hash = sha(source.read(executable))
        if exe_hash != KNOWN_EXE:
            raise ValueError('unrecognized GW.EXE variant: '+exe_hash+'; refusal preserves source-variant uncertainty')
        def read(name):
            data = source.read(name)
            manifest.append({'path': name, 'size': len(data), 'sha256': sha(data)})
            return data
        manifest.append({'path': executable, 'size': len(source.read(executable)), 'sha256': exe_hash, 'role': 'identity-only; never packed'})
        main_colors = codec.palette(codec.unpack(read(source.find('DATA/MAIN.PAL'))))
        texts = codec.unpack(read(source.find('DATA/TEXT/ENG/TEXT.DAT'))).split(b'\0')
        decoded_texts = [text.decode('cp437') for text in texts[:604]]
        if len(decoded_texts) != 604:
            raise ValueError('English text table must contain at least 604 entries')
        for number in range(1, 25):
            raw = read(source.find(f'LEVELS/CONQ{number:03}.DAT'))
            header = read(source.find(f'LEVELS/HDRCO{number}.DAT'))
            m = codec.mission(raw, header, number)
            m['sourceSha256'], m['headerSha256'] = sha(raw), sha(header)
            m['briefing'] = decoded_texts[451+number]  # campaign briefing table contract
            missions.append(m)
        for letter in 'ABCD':
            name = source.find(f'DATA/B32{letter}.DAT')
            image = codec.unpack(read(name))
            assets['B32'+letter] = {'kind': 'terrain', 'image': uri(codec.indexed_png(256, 640, image, main_colors), 'image/png')}
        for key, width, height, pal in [('TITLESCR', 640, 480, 'TITLESCR.PAL'), ('GENEPANL', 128, 480, 'MAIN.PAL')]:
            try:
                raw = codec.unpack(read(source.find('DATA/'+key+'.DAT')))
                colors = codec.palette(codec.unpack(read(source.find('DATA/'+pal))))
                assets[key] = {'kind': 'interface', 'image': uri(codec.indexed_png(width, height, raw, colors), 'image/png')}
            except (ValueError, struct.error) as error:
                unknown.append({'path': key, 'reason': str(error)})
        for name in sorted(source.files):
            if not (name.startswith('GAME/DATA/') or name.startswith('DATA/')) or not name.endswith('.ANB'):
                continue
            raw = read(name)
            key = name.rsplit('/', 1)[-1][:-4]
            try:
                decoded = codec.unpack(raw)
                # Packed4 is deliberately not guessed from pixels: creatures and bones
                # retain raw source records pending explicit hash-bound codec admissions.
                if '/CREATURE/' in name or key == 'BONES':
                    raise ValueError('packed4 palette/codec admission pending; source remains in user-owned input')
                asset = codec.anb(decoded, main_colors)
                image_bytes = asset.pop('imageBytes')
                assets[key] = {'kind': 'animation', 'sourcePath': name, 'sourceSha256': sha(raw),
                               'image': uri(image_bytes, 'image/png'), **asset}
            except (ValueError, struct.error, IndexError) as error:
                unknown.append({'path': name, 'sha256': sha(raw), 'reason': str(error)})
        # SOUND.DAT is a concatenation of self-contained RIFF WAVE files.
        raw = read(source.find('SOUND/SOUND.DAT'))
        cursor, index = 0, 0
        while cursor < len(raw):
            if raw[cursor:cursor+4] != b'RIFF' or cursor+12 > len(raw) or raw[cursor+8:cursor+12] != b'WAVE':
                unknown.append({'path': 'SOUND/SOUND.DAT', 'offset': cursor, 'reason': 'unparsed sound bank tail'})
                break
            length = struct.unpack_from('<I', raw, cursor+4)[0] + 8
            if length < 12 or cursor+length > len(raw):
                raise ValueError('truncated RIFF bank')
            sounds[str(index)] = uri(raw[cursor:cursor+length], 'audio/wav')
            cursor += length + (length % 2)
            index += 1
        for name in sorted(source.files):
            if '/SPEECH/ENG/' in '/'+name and name.endswith('.SPE'):
                raw = read(name)
                count = struct.unpack_from('<I', raw)[0]
                admitted = 0
                if count < 1024 and 4+count*8 <= len(raw):
                    for index in range(count):
                        start, size = struct.unpack_from('<II', raw, 4+index*8)
                        wave = raw[start:start+size]
                        if len(wave) == size and wave[:4] == b'RIFF' and wave[8:12] == b'WAVE':
                            sounds[name.rsplit('/', 1)[-1]+':'+str(index)] = uri(wave, 'audio/wav')
                            admitted += 1
                if admitted != count:
                    unknown.append({'path': name, 'reason': 'speech records need format validation', 'converted': admitted, 'declared': count})
        unknown += [{'path': 'campaign', 'reason': '24 maps imported; mission runtime predicates, AI, carry and acceptance incomplete'},
                    {'path': 'music', 'reason': 'CD audio tracks are not yet extracted'},
                    {'path': 'fonts', 'reason': 'font glyph import not yet integrated; readable system UI font used'}]
        pack = {'schemaVersion': 1, 'importerVersion': VERSION, 'kind': 'original-private',
                'source': {'variant': 'QA BETA V5 candidate; retail equivalence unresolved', 'sha256': source.source_hash,
                           'executableSha256': exe_hash},
                'manifest': sorted(manifest, key=lambda x: x['path']), 'missions': missions,
                'assets': assets, 'sounds': sounds, 'texts': decoded_texts, 'unknown': unknown}
        encoded = json.dumps(pack, sort_keys=True, separators=(',', ':')).encode('utf-8')
        packed = gzip.compress(encoded, compresslevel=9, mtime=0)
        target = out/'genewars.gwpack'
        atomic_private_write(target, packed)
        report = {'schemaVersion': 1, 'importerVersion': VERSION, 'variant': pack['source']['variant'],
                  'sourceSha256': source.source_hash, 'executableSha256': exe_hash,
                  'packSha256': sha(packed), 'packBytes': len(packed), 'jsonBytes': len(encoded),
                  'missions': len(missions), 'assets': len(assets), 'sounds': len(sounds),
                  'unresolvedRecords': unknown, 'completeCampaign': False}
        atomic_private_write(out/'import-report.json', (json.dumps(report, indent=2)+'\n').encode('utf-8'))
        print(json.dumps({k:v for k,v in report.items() if k != 'unresolvedRecords'}))
        return report
    finally:
        source.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--out', default=ROOT/'.private/imported', type=Path)
    args = parser.parse_args()
    try:
        run(args.source, args.out)
    except (OSError, ValueError, struct.error) as error:
        parser.exit(1, 'Import failed: '+str(error)+'\n')
