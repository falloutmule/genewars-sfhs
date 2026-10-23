"""Invented PCM/descriptor fixtures; no original sound or sample-name table."""
import copy
import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/import-original'))
import audio_profile as a


def wave_fixture(bits=16):
    """Small invented mono22050 PCM with an odd data chunk when8-bit."""
    samples = b'\x12\x34\x56\x78' if bits == 16 else b'\x12\x34\x56'
    align = bits // 8
    fmt = struct.pack('<HHIIHH', 1, 1, 22050, 22050 * align, align, bits)
    body = b'WAVEfmt ' + struct.pack('<I', len(fmt)) + fmt
    body += b'data' + struct.pack('<I', len(samples)) + samples + bytes(len(samples) & 1)
    return b'RIFF' + struct.pack('<I', len(body)) + body


def sound_fixture(count=98, formats=(2, 6), banks=1):
    # A decoy signature outside descriptor ranges must never become a sample.
    raw = bytearray(b'RIFFdecoy------!!')
    rows = []
    for bank in range(banks):
        row = [(a.MISSING,) * 4 for _ in range(a.FORMAT_COUNT)]
        for format_index in formats:
            data_offset = len(raw)
            descriptors = bytearray((count + 1) * a.DESCRIPTOR_BYTES)
            for cue in range(1, count + 1):
                # Alternate includes both widths: the bank index is not PCM.
                bits = 8 if format_index == 6 and cue % 2 else 16
                wave = wave_fixture(bits)
                relative = len(raw) - data_offset
                padded = ((len(wave) + 15) // 16 + 1) * 16
                raw.extend(wave + b'\xa7' * (padded - len(wave)))
                descriptor = cue * a.DESCRIPTOR_BYTES
                name = f'SYN{cue}.WAV'.encode('ascii')
                descriptors[descriptor:descriptor + len(name)] = name
                struct.pack_into('<I', descriptors, descriptor + 18, relative)
                struct.pack_into('<I', descriptors, descriptor + 26, padded)
            data_bytes = len(raw) - data_offset
            table_offset = len(raw)
            raw.extend(descriptors)
            row[format_index] = (table_offset, data_offset, len(descriptors), data_bytes)
        rows.append(row)
    metadata = len(raw)
    counts = [banks if index in formats else 0 for index in range(a.FORMAT_COUNT)]
    raw.extend(struct.pack('<9H', *counts))
    for row in rows:
        for fields in row:
            raw.extend(struct.pack('<4I', *fields))
    raw.extend(bytes(72))
    raw.extend(struct.pack('<I', metadata))
    return raw


def import_fixture(raw):
    # Production API deliberately has no caller identity override.
    with mock.patch.object(a, 'SOUND_DAT_SHA256', hashlib.sha256(raw).hexdigest()), \
         mock.patch.object(a, 'SOUND_DAT_BYTES', len(raw)):
        return a.import_audio_profile(raw, executable_sha256=a.EXECUTABLE_SHA256,
                                      source_version=a.SOURCE_VERSION)


def extract_fixture(raw, profile):
    with mock.patch.object(a, 'SOUND_DAT_SHA256', hashlib.sha256(raw).hexdigest()):
        return a.extract_audio_waves(raw, profile)


class AudioProfile(unittest.TestCase):
    def test_reader_uses_footer_bank_and_cue_descriptors(self):
        raw = sound_fixture(count=3, banks=2)
        parsed = a.parse_sound_container(memoryview(raw))
        self.assertEqual(parsed['formatBankCounts'], [0, 0, 2, 0, 0, 0, 2, 0, 0])
        self.assertEqual(len(parsed['banks']), 2)
        for bank in parsed['banks']:
            self.assertEqual([f['formatIndex'] for f in bank['formats']], [2, 6])
            for fmt in bank['formats']:
                self.assertEqual([r['cue'] for r in fmt['records']], [1, 2, 3])
                self.assertEqual([r['name'] for r in fmt['records']], ['SYN1.WAV', 'SYN2.WAV', 'SYN3.WAV'])
                for record in fmt['records']:
                    self.assertGreater(record['offset'], 0)
                    self.assertEqual(record['bytes'], len(wave_fixture()))
                    self.assertGreater(record['storedBytes'], record['bytes'])
                    self.assertEqual(record['sha256'], hashlib.sha256(raw[record['offset']:record['offset'] + record['bytes']]).hexdigest())

    def test_profile_requires_admitted_source_and_actual_sound_identity(self):
        raw = sound_fixture()
        with self.assertRaises(TypeError):
            a.import_audio_profile(raw)
        for exe, version in ((a.EXECUTABLE_SHA256, 'unknown'), ('0' * 64, a.SOURCE_VERSION)):
            with self.subTest(version=version), self.assertRaisesRegex(ValueError, 'version/executable identity'):
                a.import_audio_profile(raw, executable_sha256=exe, source_version=version)
        for value in (None, 'not bytes'):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'must be bytes'):
                a.import_audio_profile(value, executable_sha256=a.EXECUTABLE_SHA256, source_version=a.SOURCE_VERSION)
        with self.assertRaisesRegex(ValueError, 'SOUND.DAT identity'):
            a.import_audio_profile(raw, executable_sha256=a.EXECUTABLE_SHA256, source_version=a.SOURCE_VERSION)

    def test_profile_maps_decimal_cues_to_stable_sample_keys_and_no_subtitles(self):
        raw = sound_fixture()
        before = raw.copy()
        profile = import_fixture(raw)
        self.assertEqual(profile, import_fixture(raw))
        self.assertEqual(profile, json.loads(json.dumps(profile)))
        self.assertEqual(raw, before)
        self.assertEqual(len(profile['records']), 196)
        self.assertEqual(len(profile['cues']), 12)
        expected = {'landing.descent': 80, 'landing.contact': 81, 'landing.departure': 82,
                    'engineer.terraform': 41, 'engineer.hammer': 74, 'engineer.work': 96,
                    'distributor.pulse': 61, 'photon.pulse': 35,
                    'extractor.work': 47, 'extractor.finish': 48, 'extractor.harvest': 50, 'extractor.empty': 78}
        for semantic, cue in expected.items():
            mapping = profile['cues'][semantic]
            self.assertEqual(mapping['cue'], cue)
            self.assertEqual(mapping['descriptorIndex'], cue)
            self.assertEqual(mapping['soundKey'], f'SOUND:0:2:{cue}')
            self.assertEqual(mapping['alternateSoundKey'], f'SOUND:0:6:{cue}')
            self.assertEqual(mapping['sampleName'], f'SYN{cue}.WAV')
            self.assertIsNone(mapping['textIndex'])
        self.assertEqual(profile['cues']['distributor.pulse']['hex'], '0x3D')
        self.assertEqual(profile['cues']['photon.pulse']['hex'], '0x23')
        self.assertEqual(profile['speechBoundary']['effectCueSentinel'], 99)
        self.assertFalse(profile['provenance']['originalExecution'])
        profile['records'][0]['cue'] = -1
        self.assertEqual(import_fixture(raw)['records'][0]['cue'], 1)

    def test_extraction_uses_riff_length_and_individual_pcm_not_padded_storage(self):
        raw = sound_fixture()
        profile = import_fixture(raw)
        waves = extract_fixture(raw, profile)
        self.assertEqual(len(waves), 196)
        self.assertEqual(waves['SOUND:0:6:1'], wave_fixture(8))
        self.assertEqual(waves['SOUND:0:6:2'], wave_fixture(16))
        self.assertEqual(waves['SOUND:0:2:80'], wave_fixture(16))
        self.assertNotIn(b'\xa7', waves['SOUND:0:2:80'])
        mixed = {r['pcm']['bitsPerSample'] for r in profile['records'] if r['formatIndex'] == 6}
        self.assertEqual(mixed, {8, 16})

    def test_profile_rejects_missing_alternate_or_wrong_descriptor_count(self):
        for raw in (sound_fixture(count=97), sound_fixture(formats=(2,))):
            with self.assertRaisesRegex(ValueError, 'descriptor count'):
                import_fixture(raw)

    def test_reader_rejects_invalid_size_pointer_and_footer(self):
        for raw in (None, 'bytes', bytes(93)):
            with self.subTest(raw=type(raw).__name__), self.assertRaises(ValueError):
                a.parse_sound_container(raw)
        raw = sound_fixture(count=1)
        struct.pack_into('<I', raw, len(raw) - 4, len(raw) - 6)
        with self.assertRaisesRegex(ValueError, 'bank counts'):
            a.parse_sound_container(raw)
        raw = sound_fixture(count=1)
        footer = struct.unpack_from('<I', raw, len(raw) - 4)[0]
        struct.pack_into('<H', raw, footer + 4, 2)
        with self.assertRaisesRegex(ValueError, 'footer extent'):
            a.parse_sound_container(raw)

    def test_reader_rejects_missing_inconsistent_and_overlapping_formats(self):
        original = sound_fixture(count=1)
        footer = struct.unpack_from('<I', original, len(original) - 4)[0]
        row = footer + 18 + 2 * 16
        raw = original.copy()
        struct.pack_into('<4I', raw, row, *([a.MISSING] * 4))
        with self.assertRaisesRegex(ValueError, 'declared.*missing'):
            a.parse_sound_container(raw)
        raw = original.copy()
        struct.pack_into('<I', raw, row, a.MISSING)
        with self.assertRaisesRegex(ValueError, 'inconsistent'):
            a.parse_sound_container(raw)
        raw = original.copy()
        struct.pack_into('<H', raw, footer + 4, 0)
        with self.assertRaisesRegex(ValueError, 'inconsistent'):
            a.parse_sound_container(raw)
        raw = original.copy()
        table, data, table_bytes, data_bytes = struct.unpack_from('<4I', raw, row)
        struct.pack_into('<4I', raw, row, data, data, table_bytes, data_bytes)
        with self.assertRaisesRegex(ValueError, 'overlapping'):
            a.parse_sound_container(raw)

    def test_reader_rejects_table_and_sample_bounds_and_compressed_variant(self):
        original = sound_fixture(count=1)
        parsed = a.parse_sound_container(original)
        fmt = parsed['banks'][0]['formats'][0]
        descriptor = fmt['records'][0]['descriptorOffset']
        footer = parsed['metadataOffset']
        row = footer + 18 + 2 * 16
        for at, value, message in ((row + 8, 33, 'table length'),
                                   (descriptor + 18, fmt['dataBytes'], 'sample range'),
                                   (descriptor + 26, fmt['dataBytes'] + 1, 'sample range')):
            raw = original.copy()
            struct.pack_into('<I', raw, at, value)
            with self.subTest(at=at), self.assertRaisesRegex(ValueError, message):
                a.parse_sound_container(raw)
        raw = original.copy()
        raw[fmt['dataOffset']:fmt['dataOffset'] + 3] = b'RNC'
        with self.assertRaisesRegex(ValueError, 'explicit decoder'):
            a.parse_sound_container(raw)

    def test_reader_rejects_invalid_names_and_wave_headers(self):
        original = sound_fixture(count=1)
        record = a.parse_sound_container(original)['banks'][0]['formats'][0]['records'][0]
        descriptor, wave = record['descriptorOffset'], record['offset']
        for name, message in ((b'x' * 18, 'unterminated'), (b'../BAD.WAV\0', 'unsafe'), (b'\xff.WAV\0', 'ASCII')):
            raw = original.copy()
            raw[descriptor:descriptor + len(name)] = name
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, message):
                a.parse_sound_container(raw)
        for at, value, message in ((wave, b'FAIL', 'RIFF WAVE'),
                                   (wave + 4, struct.pack('<I', 100000), 'declared length'),
                                   (wave + 20, struct.pack('<H', 3), 'PCM WAVE')):
            raw = original.copy()
            raw[at:at + len(value)] = value
            with self.subTest(at=at), self.assertRaisesRegex(ValueError, message):
                a.parse_sound_container(raw)

    def test_profile_rejects_null_or_changed_required_descriptor(self):
        original = sound_fixture()
        parsed = a.parse_sound_container(original)
        for fmt_index, name, message in ((0, b'NULL.WAV\0', 'null placeholder'),
                                         (1, b'OTHER.WAV\0', 'differs')):
            raw = original.copy()
            at = parsed['banks'][0]['formats'][fmt_index]['records'][79]['descriptorOffset']
            raw[at:at + len(name)] = name
            with self.subTest(fmt=fmt_index), self.assertRaisesRegex(ValueError, message):
                import_fixture(raw)

    def test_extractor_rejects_changed_source_record_hash_or_duplicate_key(self):
        raw = sound_fixture()
        original = import_fixture(raw)
        changed = raw.copy()
        changed[0] ^= 1
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            extract_fixture(changed, original)
        for mutation, message in (('hash', 'hash/key'), ('duplicate', 'hash/key'), ('range', 'sample range')):
            profile = copy.deepcopy(original)
            if mutation == 'hash':
                profile['records'][0]['sha256'] = '0' * 64
            elif mutation == 'duplicate':
                profile['records'][1]['key'] = profile['records'][0]['key']
            else:
                profile['records'][0]['bytes'] = len(raw)
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, message):
                extract_fixture(raw, profile)


if __name__ == '__main__':
    unittest.main()
