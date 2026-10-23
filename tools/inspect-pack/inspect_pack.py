import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path


def inspect(path):
    data = Path(path).read_bytes()
    if len(data) > 128 * 1024 * 1024:
        raise ValueError('pack exceeds compressed limit')
    with gzip.open(path, 'rb') as stream:
        raw = stream.read(256 * 1024 * 1024 + 1)
    if len(raw) > 256 * 1024 * 1024:
        raise ValueError('pack exceeds expanded limit')
    pack = json.loads(raw)
    if pack['schemaVersion'] not in (1,2):
        raise ValueError('unsupported pack version')
    for m in pack['missions']:
        if m['width'] != 128 or m['height'] != 128 or len(m['cells']) != 16384:
            raise ValueError('invalid mission dimensions')
    for asset in pack['assets'].values():
        if not asset['image'].startswith('data:image/png;base64,') or base64.b64decode(asset['image'].split(',')[1], validate=True)[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError('invalid PNG asset')
    return {'schemaVersion':1,'packSha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),
            'variant':pack['source']['variant'],'missions':[{'id':m['id'],'name':m['name'],'status':m['runtimeStatus']} for m in pack['missions']],
            'assets':len(pack['assets']),'sounds':len(pack['sounds']),'unresolved':pack['unknown'],'completeCampaign':False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pack', required=True)
    args = parser.parse_args()
    print(json.dumps(inspect(args.pack), indent=2))
