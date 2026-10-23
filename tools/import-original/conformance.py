"""Private differential checks against preserved hash-bound evidence, read-only."""
import argparse
import gzip
import importlib.util
import json
from pathlib import Path
import struct
from sources import Source,sha
spec=importlib.util.spec_from_file_location('gw_private_codecs',Path(__file__).with_name('codecs.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
ROOT=Path(__file__).resolve().parents[2]


def run(source_path,evidence,pack_path):
    source=Source(source_path)
    try:
        manifest=json.loads((evidence/'game-files-manifest.json').read_text())
        entries={e['entry_id']:e for e in manifest['entries']}
        corpus=json.loads((evidence/'integration/rnc-corpus.json').read_text())
        decoded={};rnc_count=0;compound_skipped=0
        for row in corpus['results']:
            if not row['entry_id'].startswith('root/2/disc/'):
                continue
            entry=entries[row['entry_id']]
            name=entry.get('normalized_iso_path')
            if not name:continue
            raw=source.read(name)
            assert sha(raw)==row['input_sha256'],name+' input hash'
            if len(raw)!=18+struct.unpack_from('>I',raw,8)[0]:
                compound_skipped+=1;continue
            result=c.rnc(raw)
            assert sha(result)==row['output_sha256'],name+' decoded hash'
            decoded[name]=result;rnc_count+=1
        sprites=json.loads((evidence/'integration/sprite-corpus.json').read_text())
        sprite_count=0;asset_count=0
        for row in sprites['results']:
            if not row['entry_id'].startswith('root/2/disc/') or row['status']!='passed' or row['encoding']!='indexed8':continue
            name=entries[row['entry_id']]['normalized_iso_path']
            raw=decoded.get(name)
            if raw is None:raw=c.unpack(source.read(name))
            count,a,b,_,_=struct.unpack_from('<HIIII',raw)
            records=row['native_result']['records']
            assert len(records)==(b-a)//6
            for idx,p in enumerate(range(a,b,6)):
                offset,width,height=struct.unpack_from('<IBB',raw,p)
                indices,mask=c.sprite(raw,offset,width,height,a)
                assert width==records[idx]['width'] and height==records[idx]['height']
                assert sum(v!=0 for v in mask)==records[idx]['opaque_pixels'],name+':'+str(idx)
                sprite_count+=1
            asset_count+=1
        pack=json.loads(gzip.decompress(pack_path.read_bytes()))
        sequence=json.loads((evidence/'campaign/campaign-sequence.json').read_text())['missions']
        checked_cells=0
        for imported,expected in zip(pack['missions'],sequence,strict=True):
            assert imported['id']==expected['mission_number'] and imported['name']==expected['name']
            raw=source.read(source.find(f"LEVELS/CONQ{imported['id']:03}.DAT"))
            assert sha(raw)==imported['sourceSha256']
            assert sha(raw)==expected['resources'][f"CONQ{imported['id']:03}.DAT"]['sha256']
            for i,cell in enumerate(imported['cells']):
                assert cell==list(struct.unpack_from('<hBB',raw,0x355e+i*14+2))
                checked_cells+=1
        report={'status':'pass','sourceSha256':source.source_hash,'packSha256':sha(pack_path.read_bytes()),'rncRecordsCompared':rnc_count,'compoundRecordsExplicitlySkipped':compound_skipped,
                'indexed8ResourcesCompared':asset_count,'spriteRecordsCompared':sprite_count,'missionsCompared':len(sequence),'mapCellsCompared':checked_cells,
                'limits':['Codec/data conformance only; not original gameplay or campaign acceptance','Packed4 runtime palettes remain unresolved']}
        (ROOT/'.private/conformance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
    finally:source.close()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--evidence',type=Path,required=True);p.add_argument('--pack',type=Path,default=ROOT/'.private/imported/genewars.gwpack');a=p.parse_args();run(a.source,a.evidence,a.pack)
