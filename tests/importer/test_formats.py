import importlib.util
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
TEMP=ROOT/'test-results/importer-temp'
TEMP.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/import-original'))
spec=importlib.util.spec_from_file_location('gw_test_codecs',ROOT/'tools/import-original/codecs.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
from sources import Source,clean
spec2=importlib.util.spec_from_file_location('gw_leak',ROOT/'tools/asset-leak-check/check.py')
leak=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(leak)


class Formats(unittest.TestCase):
    def test_crc_and_palette(self):
        self.assertEqual(c.crc16(b'123456789'),0xBB3D)
        self.assertEqual(c.palette(bytes([63,0,31])*256)[0],(255,0,125))
        with self.assertRaises(ValueError):c.palette(bytes([255])*768)

    def test_rnc_header_crc_limits(self):
        with self.assertRaises(ValueError):c.rnc(b'RNC\x02'+bytes(14))
        with self.assertRaises(ValueError):c.rnc(b'RNC\x01'+struct.pack('>IIHHBB',99999,0,0,0,0,0),10)
        # Empty, CRC-correct stream is independent of any original asset.
        self.assertEqual(c.rnc(b'RNC\x01'+struct.pack('>IIHHBB',0,0,0,0,0,0)),b'')

    def test_sprite_zero_is_opaque_and_metadata_bound_is_enforced(self):
        data=bytes(18)+bytes([2,0,5,255,0])
        indices,mask=c.sprite(data,0,3,1,len(data))
        self.assertEqual(list(indices),[0,5,0]);self.assertEqual(list(mask),[255,255,0])
        with self.assertRaises(ValueError):c.sprite(data,0,3,1,20)

    def test_packed4_high_first_and_clipped_run_consumption(self):
        data=bytes(18)+bytes([3,0x12,0x30,0])
        indices,mask=c.sprite(data,0,3,1,len(data),True)
        self.assertEqual(list(indices),[1,2,3]);self.assertEqual(list(mask),[255]*3)

    def test_png_signature_and_dimensions(self):
        out=c.png(1,1,bytes([255,0,0,255]));self.assertEqual(out[:8],b'\x89PNG\r\n\x1a\n')
        with self.assertRaises(ValueError):c.png(1,1,bytes(3))

    def test_malformed_anb_rejected(self):
        with self.assertRaises(ValueError):c.anb(bytes(18),[(0,0,0)]*256)

    def test_mission_variant_and_dimensions(self):
        raw=bytearray(343958);struct.pack_into('<I',raw,0,0x55336);struct.pack_into('<I',raw,337054,0x6BE)
        header=bytearray(699);header[32:39]=b'Fixture'
        m=c.mission(raw,header,1);self.assertEqual(len(m['cells']),16384);self.assertEqual(m['name'],'Fixture')
        with self.assertRaises(ValueError):c.mission(raw[:-1],header,1)

    def test_zip_traversal_and_ambiguity_rejected(self):
        with self.assertRaises(ValueError):clean('../private/file')
        with self.assertRaises(ValueError):clean('C:/private/file')
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            path=Path(tmp)/'source.zip'
            with zipfile.ZipFile(path,'w') as z:z.writestr('../escape.dat',b'test')
            with self.assertRaises(ValueError):Source(path)

    def test_public_asset_and_credentials_are_detected_without_printing_values(self):
        with tempfile.TemporaryDirectory(dir=TEMP) as tmp:
            path=Path(tmp)/'test.ts';path.write_text('data:image/png;base64,'+'A'*100)
            self.assertIn('embedded',leak.check_file(path)[0])
            path.write_bytes(b'MZ\0test');self.assertIn('binary',leak.check_file(path)[0])


if __name__=='__main__':unittest.main()
