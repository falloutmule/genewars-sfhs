"""Synthetic metadata exercises; no original asset bytes or hold table fixture."""
import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/import-original'))
import economy_profile as e


def anb_fixture(animations, flags=0):
    """Tiny synthetic ANB: empty sprite/component tables, invented hold bytes."""
    frame_count = sum(len(holds) for holds in animations)
    frame_table = 18
    animation_table = frame_table + frame_count * e.FRAME_BYTES
    raw = bytearray(animation_table + len(animations) * e.ANIMATION_BYTES)
    struct.pack_into('<HIIII', raw, 0, len(animations), 18, 18, frame_table, animation_table)
    cursor = 0
    for index, holds in enumerate(animations):
        first = cursor * e.FRAME_BYTES
        for hold in holds:
            raw[frame_table + cursor * e.FRAME_BYTES + 10] = hold
            cursor += 1
        last = (cursor - 1) * e.FRAME_BYTES
        struct.pack_into('<IIH', raw, animation_table + index * e.ANIMATION_BYTES,
                         first, last, len(holds) | flags << 8)
    return raw


def admitted_shape_fixture():
    """Synthetic bytes with public section geometry, not an original resource.

    Successful import tests replace only the module's expected digest for this
    scope. Production has no caller argument that can override the identity.
    """
    raw = bytearray(e.BMINE_DECODED_BYTES)
    struct.pack_into('<HIIII', raw, 0, 5, *e.BMINE_SECTION_OFFSETS)
    frames, animations = e.BMINE_SECTION_OFFSETS[2:]
    holds = [(index * 5 + 3) % 11 for index in range(20)]
    for index, hold in enumerate(holds):
        raw[frames + (index + 3) * e.FRAME_BYTES + 10] = hold
    struct.pack_into('<IIH', raw, animations + e.ANIMATION_BYTES,
                     3 * e.FRAME_BYTES, 22 * e.FRAME_BYTES, 20)
    return raw, holds


def import_fixture(raw):
    with mock.patch.object(e, 'BMINE_DECODED_SHA256', hashlib.sha256(raw).hexdigest()):
        return e.import_economy_rules(raw, executable_sha256=e.EXECUTABLE_SHA256,
                                      source_version=e.SOURCE_VERSION)


class EconomyProfile(unittest.TestCase):
    def test_generic_reader_reads_actual_bytes_in_each_animation_range(self):
        raw = anb_fixture([[2, 0, 4], [3, 9]], flags=128)
        first = e.read_animation_holds(raw, 0)
        second = e.read_animation_holds(memoryview(raw), 1)
        self.assertEqual(first['holds'], [2, 0, 4])
        self.assertEqual(second['holds'], [3, 9])
        self.assertEqual(second['flags'], 128)
        self.assertEqual((second['firstFrameOffset'], second['lastFrameOffset']), (42, 56))
        self.assertEqual(raw[18 + 4 * e.FRAME_BYTES + 10], 9)

    def test_generic_reader_rejects_short_nonbytes_and_invalid_index(self):
        for raw in (None, 'not bytes', bytes(17)):
            with self.subTest(raw=type(raw).__name__), self.assertRaises(ValueError):
                e.read_animation_holds(raw, 0)
        raw = anb_fixture([[3]])
        for index in (-1, 1, True, 0.0):
            with self.subTest(index=index), self.assertRaises(ValueError):
                e.read_animation_holds(raw, index)

    def test_generic_reader_rejects_inconsistent_sections(self):
        original = anb_fixture([[1, 3]])
        for offset, value in ((2, 17), (6, 19), (10, 20), (14, len(original) + 1)):
            raw = original.copy()
            struct.pack_into('<I', raw, offset, value)
            with self.subTest(offset=offset), self.assertRaisesRegex(ValueError, 'section layout'):
                e.read_animation_holds(raw, 0)
        with self.assertRaisesRegex(ValueError, 'section layout'):
            e.read_animation_holds(original + b'\0', 0)

    def test_generic_reader_rejects_unaligned_reversed_or_outside_frames(self):
        for first, last in ((1, 14), (14, 0), (0, 28)):
            raw = anb_fixture([[1, 3]])
            animation_table = struct.unpack_from('<I', raw, 14)[0]
            struct.pack_into('<II', raw, animation_table, first, last)
            with self.subTest(first=first, last=last), self.assertRaisesRegex(ValueError, 'frame range'):
                e.read_animation_holds(raw, 0)

    def test_generic_reader_rejects_a_declared_frame_count_mismatch(self):
        raw = anb_fixture([[1, 3]])
        animation_table = struct.unpack_from('<I', raw, 14)[0]
        struct.pack_into('<H', raw, animation_table + 8, 1)
        with self.assertRaisesRegex(ValueError, 'frame-count mismatch'):
            e.read_animation_holds(raw, 0)

    def test_profile_requires_verified_source_version_and_executable_identity(self):
        raw, _ = admitted_shape_fixture()
        with self.assertRaises(TypeError):
            e.import_economy_rules(raw)
        with self.assertRaisesRegex(ValueError, 'source version'):
            e.import_economy_rules(raw, executable_sha256=e.EXECUTABLE_SHA256,
                                   source_version='retail-or-unknown')
        with self.assertRaisesRegex(ValueError, 'executable identity'):
            e.import_economy_rules(raw, executable_sha256='0' * 64,
                                   source_version=e.SOURCE_VERSION)

    def test_profile_rejects_synthetic_data_without_test_only_digest_patch(self):
        raw, _ = admitted_shape_fixture()
        for data, message in ((raw[:-1], 'length'), (raw, 'identity'), ('data', 'must be bytes')):
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                e.import_economy_rules(data, executable_sha256=e.EXECUTABLE_SHA256,
                                       source_version=e.SOURCE_VERSION)

    def test_profile_reads_holds_and_deliberately_leaves_unadmitted_grades_empty(self):
        raw, holds = admitted_shape_fixture()
        before = raw.copy()
        profile = import_fixture(raw)
        self.assertEqual(profile['extractor']['frameHolds'], [holds, [], []])
        self.assertEqual(profile['supportedExtractorGrades'], [0])
        self.assertEqual(profile['unsupportedExtractorGrades'], [1, 2])
        self.assertEqual(raw, before)
        self.assertEqual(json.loads(json.dumps(profile)), profile)
        self.assertEqual(import_fixture(raw), profile)
        # Mutating a returned profile cannot alter a subsequent import.
        profile['extractor']['frameHolds'][0][0] = 255
        self.assertEqual(import_fixture(raw)['extractor']['frameHolds'][0], holds)

    def test_source_mechanics_coefficients_are_separate_from_actual_binary_holds(self):
        raw, _ = admitted_shape_fixture()
        profile = import_fixture(raw)
        self.assertEqual(profile['power']['distributorGeneration'], [2, 4, 8])
        self.assertEqual(profile['power']['distributorRange'], [1536, 2304, 3072])
        self.assertEqual(profile['power']['distributorPulsePhase'], [0, 16, 32])
        self.assertEqual(profile['extractor']['harvestUnits'], [2, 4, 6])
        self.assertEqual(profile['capacity']['store4'], [400, 800, 1200])
        self.assertEqual(profile['capacity']['store13'], [500, 1000, 1500])
        provenance = profile['provenance']
        self.assertEqual(provenance['sourceVersion'], e.SOURCE_VERSION)
        self.assertEqual(provenance['resource']['sha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual([entry['field'] for entry in provenance['binaryDerivedFields']],
                         ['extractor.frameHolds[0]'])
        derived = {field for entry in provenance['constantDerivedFields'] for field in entry['fields']}
        self.assertNotIn('extractor.frameHolds[0]', derived)
        self.assertIn('power.noPowerWarningCooldownTicks', derived)
        self.assertIn('capacity.unusedGoopWarningTicks', derived)
        self.assertTrue(provenance['unsupported'])

    def test_profile_rejects_wrong_layout_grade0_range_and_playback_flags(self):
        raw, _ = admitted_shape_fixture()
        bad_layout = raw.copy()
        struct.pack_into('<I', bad_layout, 2, 18)
        with self.assertRaisesRegex(ValueError, 'section layout'):
            import_fixture(bad_layout)
        bad_first = raw.copy()
        struct.pack_into('<II', bad_first, e.BMINE_SECTION_OFFSETS[3] + e.ANIMATION_BYTES,
                         4 * e.FRAME_BYTES, 23 * e.FRAME_BYTES)
        with self.assertRaisesRegex(ValueError, 'grade0 running animation'):
            import_fixture(bad_first)
        bad_flags = raw.copy()
        struct.pack_into('<H', bad_flags,
                         e.BMINE_SECTION_OFFSETS[3] + e.ANIMATION_BYTES + 8, 20 | 1 << 8)
        with self.assertRaisesRegex(ValueError, 'grade0 running animation'):
            import_fixture(bad_flags)


if __name__ == '__main__':
    unittest.main()
