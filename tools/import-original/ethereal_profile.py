"""Read hash-admitted observation thresholds; never execute original code."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

THRESHOLDS_SHA256 = '88571419faedfedc1fe7819c82b21f9e964460fc070fcfa57f37b31797fd63a1'


def import_ethereal_rules(executable_bytes):
    if (not isinstance(executable_bytes, (bytes, bytearray, memoryview))
            or len(executable_bytes) > MAX_FILE_BYTES
            or sha(executable_bytes) != EXECUTABLE_SHA256):
        raise ValueError('unrecognized Ethereal executable variant')
    raw = LEImage(executable_bytes).read_object(3, 0x2E2C, 12)
    if sha(raw) != THRESHOLDS_SHA256:
        raise ValueError('Ethereal observation threshold hash mismatch')
    return {'schemaVersion': 1, 'observationThresholds': list(struct.unpack('<3i', raw)),
            'provenance': {'executableSha256': EXECUTABLE_SHA256,
                'originalExecution': False,
                'observationThresholds': {'object': 3, 'objectOffset': 0x2E2C,
                    'bytes': 12, 'sha256': THRESHOLDS_SHA256}}}
