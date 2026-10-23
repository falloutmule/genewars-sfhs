"""Synthetic startup contracts; these fixtures contain no original game data."""
import base64
import json
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/import-original'))
import startup as s


def fixture():
    raw = bytearray(s.CONQ_BYTES)
    struct.pack_into('<I', raw, 0, 0x55336)
    struct.pack_into('<I', raw, s.EXTENSION_TAG_OFFSET, 0x6BE)
    header = bytearray(s.HEADER_BYTES)
    header[32:40] = b'Fixture\0'
    return raw, header


class Startup(unittest.TestCase):
    def test_all_pool_extents_and_inactive_bytes_survive_roundtrip(self):
        raw, header = fixture()
        for family, offset, count, stride, _ in s.POOL_LAYOUTS:
            for i in range(count * stride):
                raw[offset + i] = (i * 23 + family) & 255
            for i in range(count):
                raw[offset + i * stride + 6] = 0
        result = s.parse_startup(raw, header, 24)
        self.assertEqual(result['missionNumber'], 24)
        self.assertEqual(len(result['pools']), 8)
        for pool, layout in zip(result['pools'], s.POOL_LAYOUTS):
            family, offset, count, stride, native = layout
            self.assertEqual((pool['family'], pool['capacity'], pool['packedStride'], pool['nativeStride']),
                             (family, count, stride, native))
            self.assertEqual(base64.b64decode(pool['packedBase64']), raw[offset:offset + count * stride])
            self.assertEqual(pool['activeRecords'], [])
            self.assertEqual(pool['nativeCopyRanges'], [[0, 31, 0], [31, stride, 39]])
        self.assertEqual(base64.b64decode(result['extensionBase64']), raw[s.EXTENSION_OFFSET:])
        self.assertEqual(base64.b64decode(result['missionPrefixBase64']), raw[:s.MAP_OFFSET])
        self.assertEqual(json.loads(json.dumps(result)), result)

    def test_active_last_slots_use_source_positions_and_family_offsets(self):
        raw, header = fixture()
        for family, offset, count, stride, _ in s.POOL_LAYOUTS:
            at = offset + (count - 1) * stride
            raw[at + 6] = family + 1
            struct.pack_into('<hhhhhi', raw, at + 7, -32768, 32767, -19, 23, count - 1, -123456)
            raw[at + 24] = 4
            raw[at + 25] = 9
            raw[at + 27] = 5
            raw[at + 28] = 1
            if family == 0:
                raw[at + 0x72], raw[at + 0x56] = 255, 8
            if family == 1:
                raw[at + 0x23], raw[at + 0x26] = 128, 0xA5
            if family == 2:
                raw[at + 0x4D], raw[at + 0x68], raw[at + 0x6C] = 255, 1, 31
            if family == 3:
                raw[at + 0x25] = 11
            if family == 4:
                raw[at + 0x3D] = 11
        result = s.parse_startup(raw, header)
        for pool in result['pools']:
            self.assertEqual(pool['activeCount'], 1)
            record = pool['activeRecords'][0]
            self.assertEqual(record['index'], pool['capacity'] - 1)
            self.assertEqual(record['sourceOffset'], pool['sourceOffset'] + record['index'] * pool['packedStride'])
            self.assertEqual(record['position'], [-32768, 32767])
            self.assertEqual(record['destination'], [-19, 23])
            self.assertEqual(record['height'], -123456)
            self.assertEqual((record['owner'], record['animation'], record['frame']), (4, 9, 5))
        self.assertEqual(result['pools'][0]['activeRecords'][0]['resourceSelector'], -1)
        self.assertEqual(result['pools'][0]['activeRecords'][0]['behaviorState'], 8)
        self.assertEqual(result['pools'][1]['activeRecords'][0]['resourceSelector'], -128)
        self.assertEqual(result['pools'][1]['activeRecords'][0]['plantFlags'], 0xA5)
        actor = result['pools'][2]['activeRecords'][0]
        self.assertEqual((actor['commandState'], actor['readyFlags'], actor['blueprintIndex']), (-1, 1, 31))
        self.assertEqual(result['pools'][3]['activeRecords'][0]['resourceSelector'], 11)
        self.assertEqual(result['pools'][4]['activeRecords'][0]['effectCode'], 11)

    def test_rng_is_read_from_the_tail_and_remains_before_runtime_draws(self):
        raw, header = fixture()
        struct.pack_into('<I', raw, 4, 0xDEADBEEF)  # opaque prefix is not RNG
        struct.pack_into('<IIIH', raw, 0x52474, 13, 0xFFFFFFFF, 12, 65535)
        raw[0x52482] = 3
        raw[0x1EBD] = 7
        raw[0x1C5C] = 18
        struct.pack_into('<H', raw, 0x355C, 91)
        result = s.parse_startup(raw, header)
        context = result['context']
        self.assertEqual((context['rngSeed'], context['rngDrawCount']), (65535, 0xFFFFFFFF))
        self.assertEqual((context['frameCounter'], context['frameBackup']), (13, 12))
        self.assertEqual(context['activePlayerCount'], 3)
        self.assertEqual(context['serializedCountdown'], 91)
        self.assertEqual(context['campaignEntryCountdown'], 1000)
        self.assertEqual(context['campaignFundsBeforeEngineerCosts'], 1800)
        self.assertIsNone(context['rngRing'])
        self.assertEqual(result['runtimeStatus'], 'source-only')
        self.assertFalse(result['canonicalStartupComplete'])
        self.assertEqual(result['specialistInputs']['blueprints']['opaqueScratchOffsets'], [0x18, 0x1B])

    def test_players_are_source_records_separate_from_start_targets(self):
        raw, header = fixture()
        at = s.PLAYER_OFFSET + 3 * s.PLAYER_BYTES
        raw[at + 1] = 3
        raw[at + 2] = 2
        raw[at + 3] = 255
        raw[at + 0x6E7] = 128
        struct.pack_into('<hh', raw, at + 9, 17, 19)
        struct.pack_into('<hh', raw, 0x1C7E + 3 * 4, -256, 32767)
        struct.pack_into('<I', raw, at + 0x4A3, 76543)
        entry = at + 0x16 + 31 * 36
        raw[entry:entry + 5] = b'Test\0'
        raw[entry + 0x15:entry + 0x1C] = bytes([2, 3, 33, 0xA5, 42, 42, 0x5A])
        player = s.parse_startup(raw, header)['players'][3]
        self.assertEqual((player['playerId'], player['creationMode'], player['actorCount'], player['progress']), (3, 2, -1, -128))
        self.assertEqual(player['target'], [17, 19])
        self.assertEqual(s.parse_startup(raw, header)['targets'][3], [-256, 32767])
        self.assertEqual(player['funds'], 76543)
        self.assertEqual(base64.b64decode(player['recordBase64']), raw[at:at + s.PLAYER_BYTES])
        self.assertEqual(player['blueprints'][0]['index'], 31)
        self.assertEqual(player['blueprints'][0]['opaque18'], 0xA5)
        self.assertEqual(player['blueprints'][0]['opaque1b'], 0x5A)

    def test_terrain_atlas_and_loader_water_rewrite_are_explicit(self):
        raw, header = fixture()
        raw[0x1C5B] = 3
        struct.pack_into('<h', raw, 0x1C63, -19)
        struct.pack_into('<i', raw, 0x1C67, 99999)
        record = struct.pack('<hhBBhBhBBB', -100, 300, 159, 0x72, -1, 8, -43, 0x13, 63, 7)
        raw[s.MAP_OFFSET:s.MAP_OFFSET + 14] = record
        terrain = s.parse_startup(raw, header)['terrain']
        self.assertEqual(terrain['atlasResource'], 'B32D')
        self.assertEqual((terrain['rawWaterHeight'], terrain['loadedPhysicalWaterHeight'], terrain['serializedPhysicalWaterHeight']), (-19, -38, 99999))
        self.assertEqual(base64.b64decode(terrain['mapCells14'])[:14], record)
        cell = s.decode_map_cell(record)
        self.assertEqual((cell['material'], cell['orientation'], cell['climateOffset']), (2, 0x70, -43))
        self.assertEqual((cell['headIndex'], cell['headKind'], cell['jobFlags'], cell['rawByte13']), (-1, 8, 0x13, 7))
        raw[0x1C5B] = 4
        terrain = s.parse_startup(raw, header)['terrain']
        self.assertIsNone(terrain['atlasResource'])
        self.assertTrue(terrain['unknown'])
        with self.assertRaises(ValueError):
            s.decode_map_cell(record[:-1])

    def test_zone_bounds_and_quotas_do_not_silently_become_startup_objects(self):
        raw, header = fixture()
        raw[0x34B8] = 1
        struct.pack_into('<hhBBiiiB', raw, 0x2FF8, -256, 512, 12, 255, 1024, 2048, 997, 6)
        zone = s.parse_startup(raw, header)['terrain']['zones'][0]
        self.assertEqual((zone['center'], zone['radius'], zone['initialQuota'], zone['remainingQuota']), ([-256, 512], 1024, 2048, 997))
        raw[0x34B8] = 5
        terrain = s.parse_startup(raw, header)['terrain']
        self.assertEqual(terrain['zones'], [])
        self.assertEqual(terrain['zoneCount'], 5)
        self.assertTrue(terrain['unknown'])

    def test_exact_layout_header_tags_counts_and_mission_number_are_admitted(self):
        raw, header = fixture()
        for data in [raw[:-1], raw + b'\0', bytes(s.CONQ_BYTES)]:
            with self.assertRaises(ValueError):
                s.parse_startup(data, header)
        for bad in [header[:-1], bytearray([65]) * s.HEADER_BYTES]:
            with self.assertRaises(ValueError):
                s.parse_startup(raw, bad)
        struct.pack_into('<I', raw, s.EXTENSION_TAG_OFFSET, 123)
        with self.assertRaises(ValueError):
            s.parse_startup(raw, header)
        raw, header = fixture()
        raw[0x52482] = 5
        with self.assertRaises(ValueError):
            s.parse_startup(raw, header)
        raw[0x52482] = 4
        for number in [0, 25, -1, True, 1.5]:
            with self.assertRaises(ValueError):
                s.parse_startup(raw, header, number)

    def test_blueprint_names_and_rule_profile_are_bounded_inputs(self):
        names = [f'Fixture{i:03}'.encode() for i in range(128)]
        self.assertEqual(len(s.validate_blueprint_names(names)), 128)
        for bad in [names[:-1], [b'a'] * 128, [b''] + names[1:], [b'x' * 20] + names[1:], [b'a\0b'] + names[1:]]:
            with self.assertRaises(ValueError):
                s.validate_blueprint_names(bad)
        rules = s.blueprint_rules()
        self.assertEqual((rules['skillBase'], rules['skillRange']), (25, 10))
        self.assertEqual([p['healthBase'] for p in rules['styles']], [15, 40, 10, 30])
        self.assertEqual([p['healthRange'] for p in rules['styles']], [25, 10, 15, 20])
        rules['styles'][0]['healthBase'] = 999
        self.assertEqual(s.blueprint_rules()['styles'][0]['healthBase'], 15)


if __name__ == '__main__':
    unittest.main()
