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
from startup import parse_startup, validate_blueprint_names
from rules import import_rules
from economy_profile import import_economy_rules, SOURCE_VERSION
from ecology_profile import import_ecology_rules
from packed4 import anb_packed4
from audio_profile import import_audio_profile, extract_audio_waves
from zones_profile import import_zone_rules
from ethereal_profile import import_ethereal_rules
from crater_profile import import_crater_rules
from geneticist_profile import import_geneticist_rules
from effect_profile import import_effect_rules
from specialist_voice_profile import import_specialist_voice_profile
from building_profile import import_building_rules
from strategic_ai_profile import import_strategic_ai_rules
from strategic_engineer_profile import import_strategic_engineer_rules
from creature_command_profile import import_creature_command_rules
from shepherd_profile import import_shepherd_rules

spec = importlib.util.spec_from_file_location('gw_codecs', Path(__file__).with_name('codecs.py'))
codec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)
ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.2.0'
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
        rules = import_rules(source.read(executable))
        ecology_rules = import_ecology_rules(source.read(executable))
        zone_rules = import_zone_rules(source.read(executable))
        ethereal_rules = import_ethereal_rules(source.read(executable))
        crater_rules = import_crater_rules(source.read(executable))
        geneticist_rules = import_geneticist_rules(source.read(executable))
        effect_rules = import_effect_rules(source.read(executable))
        specialist_voice_profile = import_specialist_voice_profile(source.read(executable))
        building_rules = import_building_rules(source.read(executable))
        strategic_ai_rules = import_strategic_ai_rules(source.read(executable))
        strategic_engineer_rules = import_strategic_engineer_rules(source.read(executable))
        creature_command_rules = import_creature_command_rules(source.read(executable))
        shepherd_rules = import_shepherd_rules(source.read(executable))
        def read(name):
            data = source.read(name)
            manifest.append({'path': name, 'size': len(data), 'sha256': sha(data)})
            return data
        manifest.append({'path': executable, 'size': len(source.read(executable)), 'sha256': exe_hash, 'role': 'hash-admitted numeric tables; executable never packed'})
        main_colors = codec.palette(codec.unpack(read(source.find('DATA/MAIN.PAL'))))
        fade = codec.unpack(read(source.find('DATA/FADE.DAT')))
        if len(fade) != 16384 or sha(fade) != 'b1297e2c767573164d8f2f9266a0bfd9923bb1608d0d1a22f3f3682da03d5392':
            raise ValueError('unsupported source fade table')
        texts = codec.unpack(read(source.find('DATA/TEXT/ENG/TEXT.DAT'))).split(b'\0')
        decoded_texts = [text.decode('cp437') for text in texts[:604]]
        validate_blueprint_names(texts[:128])
        economy_rules = import_economy_rules(
            codec.unpack(read(source.find('DATA/BUILDING/BMINE.ANB'))),
            executable_sha256=exe_hash, source_version=SOURCE_VERSION)
        if len(decoded_texts) != 604:
            raise ValueError('English text table must contain at least 604 entries')
        for number in range(1, 25):
            raw = read(source.find(f'LEVELS/CONQ{number:03}.DAT'))
            header = read(source.find(f'LEVELS/HDRCO{number}.DAT'))
            m = codec.mission(raw, header, number)
            m['startup'] = parse_startup(raw, header, number)
            m['sourceSeed'] = m['startup']['context']['rngSeed']
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
                asset = anb_packed4(decoded, main_colors) if '/CREATURE/' in name or key == 'BONES' else codec.anb(decoded, main_colors)
                image_bytes = asset.pop('imageBytes')
                assets[key] = {'kind': 'animation', 'sourcePath': name, 'sourceSha256': sha(raw),
                               'image': uri(image_bytes, 'image/png'), **asset}
            except (ValueError, struct.error, IndexError) as error:
                unknown.append({'path': name, 'sha256': sha(raw), 'reason': str(error)})
        # Source A1EC0/A2170 bank descriptors determine cue identity. A RIFF
        # signature scan cannot identify banks, formats or padded samples.
        raw = read(source.find('SOUND/SOUND.DAT'))
        audio_profile = import_audio_profile(raw, executable_sha256=exe_hash, source_version=SOURCE_VERSION)
        for key, wave in extract_audio_waves(raw, audio_profile).items():
            sounds[key] = uri(wave, 'audio/wav')
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
        pack = {'schemaVersion': 2, 'importerVersion': VERSION, 'kind': 'original-private', 'rules': rules, 'economyRules': economy_rules, 'ecologyRules': ecology_rules,
                'source': {'variant': 'QA BETA V5 candidate; retail equivalence unresolved', 'sha256': source.source_hash,
                           'executableSha256': exe_hash},
                'manifest': sorted(manifest, key=lambda x: x['path']), 'missions': missions,
                'palettes': {'mainRgb8': main_colors, 'fadeBase64': base64.b64encode(fade).decode('ascii'), 'fadeSha256': sha(fade)},
                'audioProfile': audio_profile, 'specialistVoiceProfile': specialist_voice_profile, 'buildingRules': building_rules, 'strategicAIRules': strategic_ai_rules, 'strategicEngineerRules': strategic_engineer_rules, 'creatureCommandRules': creature_command_rules, 'shepherdRules': shepherd_rules, 'zoneRules': zone_rules, 'etherealRules': ethereal_rules, 'craterRules': crater_rules, 'geneticistRules': geneticist_rules, 'effectRules': effect_rules,
                'assets': assets, 'sounds': sounds, 'texts': decoded_texts, 'unknown': unknown}
        encoded = json.dumps(pack, sort_keys=True, separators=(',', ':')).encode('utf-8')
        packed = gzip.compress(encoded, compresslevel=9, mtime=0)
        target = out/'genewars.gwpack'
        atomic_private_write(target, packed)
        report = {'schemaVersion': 2, 'importerVersion': VERSION, 'variant': pack['source']['variant'],
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
