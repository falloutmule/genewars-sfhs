"""Hash-admit80830's numeric landing offset without fixups or execution."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

OFFSET = 0x124F0
SIZE = 4
OFFSET_SHA256 = '4737857dac75cb2770fca5c42ecc29996a7656b68c84bc14064a35b16fc3f117'
SITE_SPANS = {
    'directionIndices': (0x4E0C, 8, '3527398a27fcc55470658f3ac8017543efe8fc8361116678e68da761b03a6568'),
    'directions': (0x4564, 36, '8aa88c050cdb4229467f43347efcd9a8d88e5651cf2684e92666dcfe886515b6'),
    'textures': (0x4E54, 18, 'a4f6449d8c575136ea84494e0ab1661a1b19c919c290ad8808b2b86fc6171288'),
    'orientations': (0x4E68, 9, 'ae9c4c6189a51a76f6bb8d49d8e7fcb001a9af16688d288725ed4b89216c8bfb'),
}


def import_specialist_recruitment_rules(executable_bytes):
    if (not isinstance(executable_bytes, (bytes, bytearray, memoryview))
            or len(executable_bytes) > MAX_FILE_BYTES
            or sha(executable_bytes) != EXECUTABLE_SHA256):
        raise ValueError('unrecognized specialist recruitment executable variant')
    image = LEImage(executable_bytes)
    raw = image.read_object(3, OFFSET, SIZE)
    if len(raw) != SIZE or sha(raw) != OFFSET_SHA256:
        raise ValueError('specialist recruitment offset hash/extent mismatch')
    site, provenance = {}, {}
    for name, (offset, size, expected) in SITE_SPANS.items():
        value = image.read_object(3, offset, size)
        if len(value) != size or sha(value) != expected:
            raise ValueError('specialist recruitment site ' + name + ' hash/extent mismatch')
        site[name] = value
        provenance[name] = {'object': 3, 'objectOffset': offset, 'bytes': size,
                            'virtualAddress': 0x100000 + offset, 'sha256': expected}
    #75240 consumes eight transition indices for nine cells. Its final unused
    #read beyond these eight is not a ninth transition or a validated index.
    if any(index >= 9 for index in site['directionIndices']):
        raise ValueError('specialist recruitment site direction index outside table')
    directions = struct.unpack('<18h', site['directions'])
    return {'schemaVersion': 1,
            'associatedLandingOffset': list(struct.unpack('<2h', raw)),
            'landingSite': {'directionIndices': list(site['directionIndices']),
                            'directions': [list(directions[i:i + 2]) for i in range(0, 18, 2)],
                            'textures': list(site['textures'][::2]),
                            'orientations': list(site['orientations'])},
            'provenance': {
                'executableSha256': EXECUTABLE_SHA256,
                'originalExecution': False,
                'sourceFunctions': ['80830', '75240'],
                'landingSite': provenance,
                'associatedLandingOffset': {
                    'object': 3, 'objectOffset': OFFSET,
                    'virtualAddress': 0x100000 + OFFSET,
                    'bytes': SIZE, 'sha256': OFFSET_SHA256,
                    'method': 'LE initialized numeric data; no fixups or execution'}}}
