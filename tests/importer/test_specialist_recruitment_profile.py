import sys
import struct
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import specialist_recruitment_profile as profile


class SpecialistRecruitmentProfile(unittest.TestCase):
    def test_signed_pair_and_exact_mapping_with_provenance(self):
        raw = bytes([0, 128, 255, 127])
        spans = dict(profile.SITE_SPANS)
        values = [bytes(range(8)), struct.pack('<18h', *range(-9, 9)), bytes(range(18)), bytes(range(9))]
        for (name, (offset, size, _)), value in zip(spans.items(), values):
            spans[name] = (offset, size, profile.sha(value))
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'OFFSET_SHA256', profile.sha(raw)), \
                patch.object(profile, 'SITE_SPANS', spans), \
                patch.object(profile, 'LEImage') as mapper:
            mapper.return_value.read_object.side_effect = [raw] + values
            result = profile.import_specialist_recruitment_rules(memoryview(b'fixture'))
            self.assertEqual([c.args for c in mapper.return_value.read_object.call_args_list],
                             [(3, 0x124F0, 4), (3, 0x4E0C, 8), (3, 0x4564, 36), (3, 0x4E54, 18), (3, 0x4E68, 9)])
        self.assertEqual(result['associatedLandingOffset'], [-32768, 32767])
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['associatedLandingOffset']['sha256'], profile.sha(raw))
        self.assertEqual(result['landingSite']['directions'][0], [-9, -8])
        self.assertEqual(result['landingSite']['textures'], list(range(0, 18, 2)))
        self.assertEqual(result['landingSite']['directionIndices'], list(range(8)))

    def test_every_site_span_is_hash_admitted_before_normalizing(self):
        raw = bytes(4)
        values = [bytes(8), bytes(36), bytes(18), bytes(9)]
        spans = {name: (offset, size, profile.sha(value))
                 for (name, (offset, size, _)), value in zip(profile.SITE_SPANS.items(), values)}
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'OFFSET_SHA256', profile.sha(raw)), \
                patch.object(profile, 'SITE_SPANS', spans), patch.object(profile, 'LEImage') as mapper:
            for index, value in enumerate(values):
                for bad in (value[:-1], value + bytes(1), bytes([1]) + value[1:]):
                    arranged = values.copy(); arranged[index] = bad
                    mapper.return_value.read_object.side_effect = [raw] + arranged
                    with self.subTest(index=index, size=len(bad)), self.assertRaisesRegex(ValueError, 'hash/extent'):
                        profile.import_specialist_recruitment_rules(b'fixture')

    def test_refuses_foreign_nonbytes_and_oversized_input_before_mapping(self):
        with patch.object(profile, 'LEImage') as mapper, patch.object(profile, 'MAX_FILE_BYTES', 8):
            for raw in (None, 'fixture', b'foreign', bytes(9)):
                with self.subTest(kind=type(raw).__name__), self.assertRaisesRegex(ValueError, 'variant'):
                    profile.import_specialist_recruitment_rules(raw)
            mapper.assert_not_called()

    def test_refuses_changed_truncated_extended_and_unmapped_spans(self):
        with patch.object(profile, 'EXECUTABLE_SHA256', profile.sha(b'fixture')), \
                patch.object(profile, 'LEImage') as mapper:
            for raw in (bytes(3), bytes(4), bytes(5)):
                mapper.return_value.read_object.return_value = raw
                with self.subTest(size=len(raw)), self.assertRaisesRegex(ValueError, 'hash/extent'):
                    profile.import_specialist_recruitment_rules(b'fixture')
            mapper.return_value.read_object.side_effect = ValueError('LE object bound')
            with self.assertRaisesRegex(ValueError, 'object bound'):
                profile.import_specialist_recruitment_rules(b'fixture')
