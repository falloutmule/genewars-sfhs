"""Hash-admitted source Engineer priority bytes. No code/fixups/execution."""
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

PRIORITY_OFFSET = 0x79A0
PRIORITY_BYTES = 42
PRIORITY_SHA256 = '61f3637e2c07fcc1db043ef0ce2eb71788651b48cc265600f2d15a8c26c843e1'


def import_strategic_engineer_rules(executable_bytes):
    if (not isinstance(executable_bytes, (bytes, bytearray, memoryview))
            or len(executable_bytes) > MAX_FILE_BYTES
            or sha(executable_bytes) != EXECUTABLE_SHA256):
        raise ValueError('unrecognized strategic Engineer executable variant')
    raw = LEImage(executable_bytes).read_object(3, PRIORITY_OFFSET, PRIORITY_BYTES)
    if len(raw) != PRIORITY_BYTES or sha(raw) != PRIORITY_SHA256:
        raise ValueError('strategic Engineer priorities hash/extent mismatch')
    return {'schemaVersion': 1,
            'priorities': [list(raw[i:i + 3]) for i in range(0, PRIORITY_BYTES, 3)],
            'provenance': {'executableSha256': EXECUTABLE_SHA256,
                           'originalExecution': False,
                           'sourceFunctions': ['390D0'],
                           'priorities': {'object': 3, 'objectOffset': PRIORITY_OFFSET,
                                          'virtualAddress': 0x100000 + PRIORITY_OFFSET,
                                          'bytes': PRIORITY_BYTES, 'sha256': PRIORITY_SHA256,
                                          'method': 'LE initialized numeric data; no fixups or execution'}}}
