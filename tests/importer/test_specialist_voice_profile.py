import json
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import specialist_voice_profile as v


def fixture():
    categories = b'one\0two\0tri\0for\0'
    styles = b'abcd'
    stems = ['synthetic/' + chr(c) + token for c in styles
             for token in ('one', 'two', 'tri', 'for')]
    names = [s + '.spe' for s in reversed(stems)] + ['synthetic/extra.spe', 'synthetic/other.spe']
    packed, pointers = bytearray(), []
    for name in names:
        pointers.append(0x2000 + len(packed))
        packed.extend(name.encode('ascii') + b'\0')
    values = {
        'descriptorClasses': (0x900, bytes(i % 16 for i in range(100))),
        'styleChars': (0x1000, styles),
        'categoryPointers': (0x1100, struct.pack('<4I', 0x1200, 0x1204, 0x1208, 0x120C)),
        'categoryStrings': (0x1200, categories),
        'filenameFormat': (0x1300, b'synthetic/%c%s%03d.wav\0'),
        'bundlePointers': (0x1400, struct.pack('<18I', *pointers)),
        'bundleStrings': (0x2000, bytes(packed)),
    }
    spans = {k: (offset, len(raw), v.sha(raw)) for k, (offset, raw) in values.items()}
    def read(obj, offset, length):
        if obj != 3:
            raise AssertionError('Unexpected object')
        return next(raw for at, raw in values.values() if at == offset and len(raw) == length)
    return values, spans, read


class SpecialistVoiceProfileTests(unittest.TestCase):
    def test_identity_rejected_before_mapper(self):
        with patch.object(v, 'LEImage') as image:
            for raw in (None, 'fixture', b'fixture'):
                with self.assertRaises(ValueError):
                    v.import_specialist_voice_profile(raw)
            image.assert_not_called()

    def imported(self, values=None):
        values, spans, read = fixture() if values is None else values
        with patch.object(v, 'EXECUTABLE_SHA256', v.sha(b'fixture')), \
             patch.object(v, 'SPANS', spans), patch.object(v, 'LEImage') as image:
            image.return_value.read_object.side_effect = read
            out = v.import_specialist_voice_profile(b'fixture')
            self.assertEqual(image.return_value.read_object.call_count, 7)
        return out

    def test_normalizes_all_bindings_without_exposing_pointer_words(self):
        out = self.imported()
        self.assertEqual(len(out['rows']), 16)
        self.assertEqual(out['rows'][0], {
            'style': 0, 'category': 0, 'filenamePrefix': 'synthetic/aone',
            'filenameSuffix': '.wav', 'speechContainer': 'synthetic/aone.spe',
            'bundleIndex': 15, 'soundKeyPrefix': 'AONE.SPE:'})
        self.assertEqual(out['rows'][-1]['bundleIndex'], 0)
        self.assertEqual(out['descriptorClasses'], [i % 16 for i in range(100)])
        self.assertFalse(out['provenance']['originalExecution'])
        self.assertTrue(out['provenance']['nativePointersOmitted'])
        self.assertEqual(json.loads(json.dumps(out)), out)

    def test_modified_span_fails_its_hash_before_decoding(self):
        _, spans, read = fixture()
        def altered(obj, offset, length):
            raw = read(obj, offset, length)
            return bytes([raw[0] ^ 1]) + raw[1:] if offset == spans['styleChars'][0] else raw
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            self.imported((None, spans, altered))

    def test_rejects_pointer_outside_admitted_string_span(self):
        values, spans, read = fixture()
        raw = struct.pack('<4I', 0x11FF, 0x1204, 0x1208, 0x120C)
        values['categoryPointers'] = (0x1100, raw)
        spans['categoryPointers'] = (0x1100, len(raw), v.sha(raw))
        with self.assertRaisesRegex(ValueError, 'outside admitted span'):
            self.imported((values, spans, read))

    def test_rejects_unterminated_bundle_and_missing_binding(self):
        for mutation, message in [('unterminated', 'unterminated'), ('missing', 'binding')]:
            values, spans, read = fixture()
            at, raw = values['bundleStrings']
            raw = raw[:-1] + b'x' if mutation == 'unterminated' else raw.replace(b'dfor.spe', b'none.spe')
            values['bundleStrings'] = (at, raw)
            spans['bundleStrings'] = (at, len(raw), v.sha(raw))
            with self.assertRaisesRegex(ValueError, message):
                self.imported((values, spans, read))


if __name__ == '__main__':
    unittest.main()
