"""Synthetic packed4 vectors; original fixture access is explicit and private."""
import base64
import json
import os
import struct
import sys
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools/import-original'))
import packed4 as p


def fixture(payload=None, width=3, height=2):
    payload = payload if payload is not None else bytes([3, 0x01, 0x2F, 0, 255, 2, 0x34, 0])
    table = 18+len(payload)
    offsets = [table, table+6, table+16, table+30]
    return (struct.pack('<H4I', 1, *offsets)+payload+struct.pack('<IBB', 0, width, height)
            +struct.pack('<IhhBB', 0, -3, -5, 1, 2)
            +struct.pack('<IhhHBBBB', 0, width*2, height*2, 0, 2, 1, 3, 4)
            +struct.pack('<IIH', 0, 0, 0x101))


def png_rows(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    width, height = struct.unpack_from('>II', data, 16)
    cursor, compressed = 8, b''
    while cursor < len(data):
        length = struct.unpack_from('>I', data, cursor)[0]
        if data[cursor+4:cursor+8] == b'IDAT': compressed += data[cursor+8:cursor+8+length]
        cursor += length+12
    raw = zlib.decompress(compressed)
    rows = []
    for row in range(height):
        start = row*(width*4+1)
        assert raw[start] == 0
        rows.append(raw[start+1:start+1+width*4])
    return width, height, rows


class Packed4(unittest.TestCase):
    def test_high_first_odd_padding_zero_opaque_skip_and_wrapping_base(self):
        raw = fixture()
        bound = struct.unpack_from('<I', raw, 2)[0]
        pixels, mask, consumed = p.sprite_packed4(raw, 0, 3, 2, bound)
        self.assertEqual(pixels, bytes([0, 1, 2, 0, 3, 4]))
        self.assertEqual(mask, bytes([1, 1, 1, 0, 1, 1]))
        self.assertEqual(consumed, 8)
        self.assertEqual(p.sprite_packed4(raw, 0, 3, 2, bound, 254)[0], bytes([254, 255, 0, 0, 1, 2]))

    def test_clipped_run_consumes_complete_payload_before_next_row(self):
        raw = fixture(bytes([5, 0x12, 0x34, 0x5F, 0, 2, 0x67, 0]), 2, 2)
        pixels, mask, consumed = p.sprite_packed4(raw, 0, 2, 2, 26)
        self.assertEqual(pixels, bytes([1, 2, 6, 7]))
        self.assertEqual(mask, bytes([1]*4)); self.assertEqual(consumed, 8)

    def test_short_rows_and_negative128_are_transparent(self):
        raw = fixture(bytes([0, 128, 0]), 4, 2)
        pixels, mask, consumed = p.sprite_packed4(raw, 0, 4, 2, 21)
        self.assertEqual(pixels, bytes(8)); self.assertEqual(mask, bytes(8)); self.assertEqual(consumed, 3)
        self.assertEqual(p.sprite_packed4(bytes(18), 99999, 0, 0, 18), (b'', b'', 0))

    def test_all_positive_controls_and_clips_match_independent_pixel_sequence(self):
        for count in range(1, 128):
            values = [(count+i*3) % 16 for i in range(count)]
            packed = bytes((values[i] << 4) | (values[i+1] if i+1 < count else 15) for i in range(0, count, 2))
            raw = bytes(18)+bytes([count])+packed+b'\0'
            for width in (1, min(count, 7), min(255, count+1)):
                pixels, mask, consumed = p.sprite_packed4(raw, 0, width, 1, len(raw), 250)
                wanted = bytes([(250+n) % 256 for n in values[:width]]+[0]*max(0, width-count))
                self.assertEqual(pixels, wanted); self.assertEqual(sum(mask), min(width, count))
                self.assertEqual(consumed, 2+len(packed))

    def test_bounds_never_use_metadata_as_missing_payload_or_row_terminator(self):
        for payload in (bytes([3, 0x12]), bytes([2, 0x12]), bytes([127, 0x12])):
            raw = fixture(payload, 3, 1)
            bound = 18+len(payload)
            with self.assertRaises(ValueError): p.sprite_packed4(raw, 0, 3, 1, bound)
        raw = fixture()
        for offset, width, height, bound, base in ((-1, 3, 2, 26, 0), (8, 3, 2, 26, 0),
                (0, 256, 2, 26, 0), (0, 3, -1, 26, 0), (0, 3, 2, 9999, 0), (0, 3, 2, 26, 256)):
            with self.assertRaises(ValueError): p.sprite_packed4(raw, offset, width, height, bound, base)

    def test_metadata_preserves_signed_half_coordinates_and_all_animation_bytes(self):
        parsed = p.decode_database(fixture())
        self.assertEqual(parsed['frames'], [{'components': [[0, -2, -3, 1, 2]], 'width': 3,
                                            'height': 2, 'rawFlags': [2, 3, 4]}])
        self.assertEqual(parsed['animations'], [{'first': 0, 'last': 0, 'rawTrailingWord': 0x101}])
        self.assertEqual(parsed['descriptions'][0]['opaquePixels'], 5)

    def test_rejects_malformed_sections_references_and_excess_pixels(self):
        raw = fixture(); a, b, c, d = struct.unpack_from('<4I', raw, 2)
        for offset, value in ((2, 17), (6, a+5), (b, 1), (c, 1), (d, 14), (d+4, 14)):
            corrupt = bytearray(raw); struct.pack_into('<I', corrupt, offset, value)
            with self.subTest(offset=offset), self.assertRaises(ValueError): p.decode_database(corrupt)
        for corrupt in (raw[:-1], b'', bytes(18)):
            with self.assertRaises(ValueError): p.decode_database(corrupt)
        with patch.object(p, 'MAX_PIXELS', 5):
            with self.assertRaisesRegex(ValueError, 'pixel budget'): p.decode_database(raw)

    def test_production_import_requires_source_hash_and_real_palette_banks(self):
        raw = fixture(); colors = [(i, i ^ 255, i*3 & 255) for i in range(256)]
        with self.assertRaisesRegex(ValueError, 'not admitted'): p.anb_packed4(raw, colors)
        with patch.dict(p.ADMITTED, {p.sha(raw): 'synthetic'}):
            result = p.anb_packed4(raw, colors)
            self.assertEqual(base64.b64decode(result['packed4']['indices']), bytes([0, 1, 2, 0, 3, 4]))
            self.assertEqual(base64.b64decode(result['packed4']['opacity']), bytes([1, 1, 1, 0, 1, 1]))
            width, height, rows = png_rows(result['imageBytes'])
            self.assertEqual((width, height), (1024, 2))
            self.assertEqual(rows[0][:4], bytes((*colors[192], 255)))
            self.assertEqual(rows[1][:4], bytes(4))
            alternate = base64.b64decode(result['paletteAtlases']['208'].split(',', 1)[1])
            self.assertEqual(png_rows(alternate)[2][0][:4], bytes((*colors[208], 255)))
            self.assertFalse(result['packed4']['neutralPalette']['wrapperAdmission'])
            result.pop('imageBytes'); json.dumps(result)
            for invalid in (colors[:16], [(0, 0, 999)]*256):
                with self.assertRaises(ValueError): p.anb_packed4(raw, invalid)
            with patch.dict(p.PIXEL_SHA256, {p.sha(raw): '0'*64}):
                with self.assertRaisesRegex(ValueError, 'independent reference'): p.anb_packed4(raw, colors)


@unittest.skipUnless(os.environ.get('GENEWARS_PACKED4_SOURCE'), 'private source path not supplied; CI uses synthetic data only')
class PrivatePacked4(unittest.TestCase):
    def test_all26_admitted_resources_match_independent_pixel_digests(self):
        from sources import Source
        source = Source(os.environ['GENEWARS_PACKED4_SOURCE'])
        try:
            for source_hash, name in p.ADMITTED.items():
                with self.subTest(resource=name):
                    raw = source.read(source.find('DATA/CREATURE/'+name.upper()+'.ANB'))
                    self.assertEqual(p.sha(raw), source_hash)
                    self.assertEqual(p.decode_database(raw)['pixelSha256'], p.PIXEL_SHA256[source_hash])
        finally: source.close()

    def test_hash_bound_mule_bones_pixels_and_metadata(self):
        from sources import Source
        source = Source(os.environ['GENEWARS_PACKED4_SOURCE'])
        try:
            for name, source_hash, sprite_count, frame_count, animation_count in (
                    ('MULE', p.MULE_SHA256, 115, 178, 24), ('BONES', p.BONES_SHA256, 11, 10, 5)):
                raw = source.read(source.find('DATA/CREATURE/'+name+'.ANB'))
                self.assertEqual(p.sha(raw), source_hash)
                parsed = p.decode_database(raw)
                self.assertEqual(len(parsed['descriptions']), sprite_count)
                self.assertEqual(len(parsed['frames']), frame_count)
                self.assertEqual(len(parsed['animations']), animation_count)
                self.assertEqual(parsed['pixelSha256'], p.PIXEL_SHA256[source_hash])
        finally: source.close()


if __name__ == '__main__': unittest.main()
