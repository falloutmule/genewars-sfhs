"""Admit the shared Shepherd/Geneticist seven-row projectile profile."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

PROFILE_SHA256 = '5b5970788c90e1f91017023f9286ad5621f45e150461fcc54073b37c13c7360c'

def import_shepherd_rules(executable_bytes):
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('shepherd input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES or sha(executable_bytes) != EXECUTABLE_SHA256:
        raise ValueError('unrecognized shepherd executable variant')
    data = LEImage(executable_bytes).read_object(3, 0x4AB4, 49)
    if len(data) != 49 or sha(data) != PROFILE_SHA256:
        raise ValueError('shepherd projectile table hash mismatch')
    rows = []
    for index in range(7):
        speed, scale, cooldown, code = struct.unpack_from('<hhhB', data, index*7)
        rows.append({'speedWord': speed, 'rangeFactor': scale, 'cooldown': cooldown, 'effectCode': code})
    return {'schemaVersion': 1, 'projectiles': rows, 'provenance': {
        'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
        'object': 3, 'objectOffset': 0x4AB4, 'bytes': 49, 'sha256': PROFILE_SHA256}}
