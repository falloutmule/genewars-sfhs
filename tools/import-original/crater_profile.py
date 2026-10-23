"""Bounded77C60 crater texture tables from the admitted executable; no execution."""
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

RANGES = (
    ('largeTextures', 0x4B44, 9, 'e4ff2d4a754207a46314a8101552d8dd126a2bee4bca480368d5e779ad12948c'),
    ('largeFlags', 0x4B50, 9, 'a71aab368a3aea3256da970b6c9a2303ad412f00a7ca5331769d64f2ef95c94d'),
)


def import_crater_rules(executable_bytes):
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('crater input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES or sha(executable_bytes) != EXECUTABLE_SHA256:
        raise ValueError('unrecognized crater executable variant')
    image = LEImage(executable_bytes)
    result = {'schemaVersion': 1, 'provenance': {
        'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
        'sourceFunctions': ['77C60', '79160'], 'ranges': {}}}
    for name, offset, size, expected in RANGES:
        raw = image.read_object(3, offset, size)
        if sha(raw) != expected:
            raise ValueError('crater table hash mismatch: ' + name)
        result[name] = list(raw)
        result['provenance']['ranges'][name] = {
            'object': 3, 'objectOffset': offset, 'virtualAddress': 0x100000 + offset,
            'bytes': size, 'sha256': expected, 'method': 'LE initialized data; no execution or relocations'}
    return result
