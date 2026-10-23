"""Synthetic LE fixtures; no original executable or table contents belong here."""
import hashlib
import json
import math
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/import-original'))
import rules


def fixture(pages=None, order=None, size=1200):
    pages = pages or [b'A'*512, b'B'*5]
    order = order or list(range(1, len(pages)+1))
    header, objects, page_table, data_base = 0x80, 0x110, 0x128, 0x400
    raw = bytearray(data_base+(len(pages)-1)*512+len(pages[-1]))
    raw[:2] = b'MZ'
    struct.pack_into('<I', raw, 0x3C, header)
    raw[header:header+2] = b'LE'
    for offset, value in ((0x14, len(pages)), (0x28, 512), (0x2C, len(pages[-1])),
                          (0x40, objects-header), (0x44, 1),
                          (0x48, page_table-header), (0x80, data_base)):
        struct.pack_into('<I', raw, header+offset, value)
    struct.pack_into('<6I', raw, objects, size, 0x10000, 3, 1, len(pages), 0)
    for index, physical in enumerate(order):
        raw[page_table+index*4:page_table+index*4+4] = physical.to_bytes(3, 'big')+b'\0'
    for index, page in enumerate(pages):
        raw[data_base+index*512:data_base+index*512+len(page)] = page
    return raw


class Rules(unittest.TestCase):
    def test_reads_cross_page_and_zero_filled_partial_page_and_virtual_tail(self):
        image = rules.LEImage(fixture())
        self.assertEqual(image.read_object(1, 510, 12), b'AA'+b'B'*5+bytes(5))
        self.assertEqual(image.read_object(1, 1016, 184), bytes(184))
        self.assertEqual(image.read_object(1, 1200, 0), b'')

    def test_uses_big_endian_physical_page_numbers_instead_of_file_order(self):
        image = rules.LEImage(fixture(order=[2, 1]))
        self.assertEqual(image.read_object(1, 0, 8), b'B'*5+bytes(3))
        self.assertEqual(image.read_object(1, 510, 6), bytes(2)+b'A'*4)

    def test_refuses_bad_read_ranges(self):
        image = rules.LEImage(fixture())
        for args in ((0, 0, 1), (2, 0, 1), (1, -1, 1), (1, 0, -1),
                     (1, 1199, 2), (1, 1201, 0), (1, 0, 2**32)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                image.read_object(*args)

    def test_refuses_bad_headers_tables_and_truncated_physical_storage(self):
        mutations = [(0x3C, 0xFFFFFFF0), (0x80+0x14, 0), (0x80+0x28, 513),
                     (0x80+0x2C, 513), (0x80+0x44, 4097),
                     (0x80+0x40, 0xFFFFFF00), (0x80+0x48, 0),
                     (0x80+0x80, 0x100), (0x110, rules.MAX_VIRTUAL_BYTES+1),
                     (0x110+12, 2), (0x110+16, 3), (0x110+20, 1)]
        for offset, value in mutations:
            raw = fixture()
            struct.pack_into('<I', raw, offset, value)
            with self.subTest(offset=offset, value=value), self.assertRaises(ValueError):
                rules.LEImage(raw)
        for raw in (b'', fixture()[:-1], b'NO'+fixture()[2:]):
            with self.assertRaises(ValueError):
                rules.LEImage(raw)
        for offset, value in ((0x80+2, 1), (0x128+3, 1), (0x128, 255)):
            raw = fixture()
            raw[offset] = value
            with self.assertRaises(ValueError):
                rules.LEImage(raw)

    def test_refuses_overlapping_and_unowned_logical_pages(self):
        raw = fixture()
        # Move the page table to make room for a second object record.
        raw[0x140:0x148] = raw[0x128:0x130]
        struct.pack_into('<I', raw, 0x80+0x48, 0x140-0x80)
        struct.pack_into('<I', raw, 0x80+0x44, 2)
        struct.pack_into('<6I', raw, 0x128, 512, 0x20000, 3, 2, 1, 0)
        with self.assertRaisesRegex(ValueError, 'overlapping'):
            rules.LEImage(raw)
        raw = fixture()
        struct.pack_into('<I', raw, 0x110+16, 1)
        with self.assertRaisesRegex(ValueError, 'unowned'):
            rules.LEImage(raw)

    def test_border_first_assignment_orientations_mask_and_default(self):
        patterns = bytes([8, 9, 10, 11])*160  # Mask to [0,1,2,3].
        border = rules.build_terrain_border(patterns)
        transforms = [((0, 1, 2, 3), 0), ((1, 0, 3, 2), 16),
                      ((2, 3, 0, 1), 48), ((3, 2, 1, 0), 32),
                      ((1, 2, 3, 0), 96), ((2, 1, 0, 3), 112),
                      ((3, 0, 1, 2), 80), ((0, 3, 2, 1), 64)]
        self.assertEqual(len(border), 8192)
        for corners, orientation in transforms:
            key = sum(value << shift for value, shift in zip(corners, (9, 6, 3, 0)))
            self.assertEqual(border[key*2:key*2+2], bytes([0, orientation]))
        self.assertEqual(border[-2:], bytes([151, 0]))
        for length in (0, 639, 641):
            with self.assertRaises(ValueError):
                rules.build_terrain_border(bytes(length))

    def test_generated_trig_rule_matches_the_admitted_data_hashes(self):
        # Established independent numeric rule; no original bytes are embedded.
        for name, function in (('sine', math.sin), ('cosine', math.cos)):
            values = [math.trunc(65536*function(i*math.tau/2048)) for i in range(2048)]
            expected = next(row[-1] for row in rules.TABLES if row[0] == name)
            self.assertEqual(hashlib.sha256(struct.pack('<2048i', *values)).hexdigest(), expected)

    def test_actor_styles_read_signed_word_and_signed_dword_columns(self):
        raw = b''.join(struct.pack('<4i', 0x7FFF8000+index, 123, -index-1, 100+index)
                       for index in range(4))
        result = rules.normalize_actor_styles(raw)
        self.assertEqual(result['actorClassSpeeds'], [-32768, -32767, -32766, -32765])
        self.assertEqual(result['blueprintStat17Caps'], [-1, -2, -3, -4])
        self.assertEqual(result['blueprintStat19Caps'], [100, 101, 102, 103])
        with self.assertRaises(ValueError):
            rules.normalize_actor_styles(raw[:-1])

    def test_actor_descriptors_normalize_keys_without_native_pointer_bytes(self):
        raw = bytearray(704)
        for key in range(16):
            name = f'data/spec/fixture{key:02}.anb'.encode('ascii')
            raw[key*44:key*44+len(name)] = name
            struct.pack_into('<I', raw, key*44+28, 0x168F4+key*4)
        names = rules.normalize_actor_descriptors(raw)
        self.assertEqual(names[0], 'data/spec/fixture00.anb')
        self.assertEqual(names[-1], 'data/spec/fixture15.anb')
        for field, value in ((0, ord('/')), (27, 1), (28, 0)):
            corrupt = bytearray(raw)
            corrupt[field] = value
            with self.assertRaises(ValueError):
                rules.normalize_actor_descriptors(corrupt)
        for size in (0, 703, 705):
            with self.assertRaises(ValueError):
                rules.normalize_actor_descriptors(bytes(size))

    def test_normalizes_only_explicit_hash_bound_tables_and_provenance(self):
        patterns = bytes([0, 1, 2, 3])*160
        other = struct.pack('<hH', -123, 65535)
        payload = patterns+other
        raw = fixture(pages=[payload[:512], payload[512:]], size=len(payload))
        table_specs = (('terrainCornerPatterns', 1, 0, 'B', 640, rules.sha(patterns)),
                       ('signed', 1, 640, 'h', 1, rules.sha(other[:2])),
                       ('unsigned', 1, 642, 'H', 1, rules.sha(other[2:])))
        with patch.object(rules, 'EXECUTABLE_SHA256', rules.sha(raw)), \
                patch.object(rules, 'TABLES', table_specs), \
                patch.object(rules, 'AUXILIARY_TABLES', ()), \
                patch.object(rules, 'TERRAIN_BORDER_SHA256', rules.sha(rules.build_terrain_border(patterns))):
            result = rules.import_rules(raw)
            self.assertEqual(result['tables']['signed'], [-123])
            self.assertEqual(result['tables']['unsigned'], [65535])
            self.assertEqual(result['tables']['terrainCornerPatterns'], list(patterns))
            self.assertEqual(result['provenance']['tables']['unsigned']['virtualAddress'], 0x10000+642)
            self.assertFalse(result['provenance']['originalExecution'])
            json.dumps(result)  # Entire return value is private-pack JSON data.
            corrupt = bytearray(raw)
            corrupt[0x400+640] ^= 1
            with patch.object(rules, 'EXECUTABLE_SHA256', rules.sha(corrupt)):
                with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                    rules.import_rules(corrupt)
            with patch.object(rules, 'TERRAIN_BORDER_SHA256', '0'*64):
                with self.assertRaisesRegex(ValueError, 'border table hash mismatch'):
                    rules.import_rules(raw)
        with self.assertRaisesRegex(ValueError, 'unrecognized'):
            rules.import_rules(raw)


if __name__ == '__main__':
    unittest.main()
