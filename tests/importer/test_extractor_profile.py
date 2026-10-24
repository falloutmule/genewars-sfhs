"""Synthetic admission/corruption tests; no original executable or artwork."""
import contextlib
import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/import-original'))
import extractor_profile as e

EXE = b'synthetic extractor executable'
CONTACT = struct.pack('<hh', -17, 321)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def fixture():
    raw = bytearray(e.BMINE_DECODED_BYTES)
    struct.pack_into('<HIIII', raw, 0, 5, *e.BMINE_SECTION_OFFSETS)
    frames, animations = e.BMINE_SECTION_OFFSETS[2:]
    expected = []
    for grade in range(3):
        first_frame = 3 + grade * 20
        holds = [(index * 7 + grade * 3 + 5) % 13 for index in range(20)]
        for index, hold in enumerate(holds):
            raw[frames + (first_frame + index) * 14 + 10] = hold
        struct.pack_into('<IIH', raw, animations + (grade + 1) * 10,
                         first_frame * 14, (first_frame + 19) * 14, 20)
        expected.append(holds)
    return raw, expected


@contextlib.contextmanager
def admitted(raw, contact=CONTACT):
    # Only tests replace expected identities. The production function has no
    # identity/geometry override arguments, and still checks all read spans.
    with contextlib.ExitStack() as stack:
        stack.enter_context(mock.patch.object(e, 'EXECUTABLE_SHA256', digest(EXE)))
        stack.enter_context(mock.patch.object(e, 'BMINE_DECODED_SHA256', digest(raw)))
        stack.enter_context(mock.patch.object(e, 'CONTACT_OFFSET_SHA256', digest(CONTACT)))
        mapper = stack.enter_context(mock.patch.object(e, 'LEImage'))
        mapper.return_value.read_object.return_value = contact
        yield mapper


class ExtractorProfile(unittest.TestCase):
    def test_reads_all_grades_and_signed_contact_with_exact_provenance(self):
        raw, expected = fixture()
        original = bytes(raw)
        with admitted(raw) as mapper:
            result = e.import_extractor_rules(memoryview(EXE), memoryview(raw))
            mapper.return_value.read_object.assert_called_once_with(3, 0x4574, 4)
        self.assertEqual(result['contactOffset'], [-17, 321])
        self.assertEqual(result['frameHolds'], expected)
        self.assertEqual(bytes(raw), original)
        self.assertEqual(json.loads(json.dumps(result)), result)
        self.assertFalse(result['provenance']['originalExecution'])
        self.assertEqual(result['provenance']['contactOffset']['sha256'], digest(CONTACT))
        for grade, row in enumerate(result['provenance']['animationProfiles']):
            self.assertEqual((row['grade'], row['action']), (grade, grade + 1))
            self.assertEqual((row['firstFrameOffset'], row['lastFrameOffset']),
                             ((3 + grade * 20) * 14, (22 + grade * 20) * 14))
            self.assertEqual(row['resourceSha256'], digest(raw))
        raw[e.BMINE_SECTION_OFFSETS[2] + 3 * 14 + 10] ^= 255
        self.assertEqual(result['frameHolds'], expected)

    def test_rejects_foreign_or_nonbyte_executable_before_mapping(self):
        raw, _ = fixture()
        for executable in (None, 'text', b'foreign'):
            with self.subTest(executable=type(executable).__name__), admitted(raw) as mapper:
                with self.assertRaises(ValueError):
                    e.import_extractor_rules(executable, raw)
                mapper.assert_not_called()

    def test_rejects_oversized_executable_before_mapping(self):
        raw, _ = fixture()
        with admitted(raw) as mapper, mock.patch.object(e, 'MAX_FILE_BYTES', 8):
            with self.assertRaises(ValueError):
                e.import_extractor_rules(bytes(9), raw)
            mapper.assert_not_called()

    def test_rejects_changed_truncated_and_nonbyte_bmine_before_mapping(self):
        raw, _ = fixture()
        changed = raw.copy()
        changed[100] ^= 1
        for candidate in (None, 'text', raw[:-1], changed):
            with self.subTest(candidate=type(candidate).__name__), admitted(raw) as mapper:
                with self.assertRaises(ValueError):
                    e.import_extractor_rules(EXE, candidate)
                mapper.assert_not_called()

    def test_rejects_admitted_but_inconsistent_running_geometry(self):
        raw, _ = fixture()
        animations = e.BMINE_SECTION_OFFSETS[3]
        cases = []
        bad = raw.copy()
        struct.pack_into('<H', bad, 0, 4)
        cases.append(bad)
        bad = raw.copy()
        struct.pack_into('<H', bad, animations + 2 * 10 + 8, 20 | 128 << 8)
        cases.append(bad)
        bad = raw.copy()
        struct.pack_into('<IIH', bad, animations + 3 * 10, 42, 308, 20)
        cases.append(bad)
        bad = raw.copy()
        struct.pack_into('<IIH', bad, animations + 10, 42, 294, 19)
        cases.append(bad)
        for index, candidate in enumerate(cases):
            with self.subTest(index=index), admitted(candidate):
                with self.assertRaises(ValueError):
                    e.import_extractor_rules(EXE, candidate)

    def test_rejects_changed_or_short_mapped_contact_span(self):
        raw, _ = fixture()
        for contact in (CONTACT[:-1], struct.pack('<hh', -17, 322)):
            with self.subTest(contact=contact), admitted(raw, contact):
                with self.assertRaisesRegex(ValueError, 'span hash mismatch'):
                    e.import_extractor_rules(EXE, raw)

    def test_propagates_mapper_bounds_failure(self):
        raw, _ = fixture()
        with admitted(raw) as mapper:
            mapper.return_value.read_object.side_effect = ValueError('mapped span outside object')
            with self.assertRaisesRegex(ValueError, 'outside object'):
                e.import_extractor_rules(EXE, raw)


if __name__ == '__main__':
    unittest.main()
