"""Admit complete native Extractor inputs without changing the old economy profile."""
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha
from economy_profile import (SOURCE_VERSION, BMINE_DECODED_BYTES,
                             BMINE_DECODED_SHA256, BMINE_SECTION_OFFSETS,
                             FRAME_BYTES, read_animation_holds)

CONTACT_OFFSET_SHA256 = 'b40711a88c7039756fb8a73827eabe2c0fe5a0346ca7e0a104adc0fc764f528d'


def import_extractor_rules(executable_bytes, decoded_bmine):
    """Verify both original inputs, then read every admitted numeric byte.

    No caller-supplied identity, synthetic grade fallback, original execution,
    mutable input retention, or device playback status enters this profile.
    """
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('extractor input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES or sha(executable_bytes) != EXECUTABLE_SHA256:
        raise ValueError('unrecognized extractor executable variant')
    if not isinstance(decoded_bmine, (bytes, bytearray, memoryview)):
        raise ValueError('decoded BMINE must be bytes')
    raw = bytes(decoded_bmine)
    if len(raw) != BMINE_DECODED_BYTES or sha(raw) != BMINE_DECODED_SHA256:
        raise ValueError('unrecognized extractor BMINE identity')
    count, *offsets = struct.unpack_from('<HIIII', raw)
    if count != 5 or tuple(offsets) != BMINE_SECTION_OFFSETS:
        raise ValueError('unsupported extractor BMINE section layout')
    contact = LEImage(executable_bytes).read_object(3, 0x4574, 4)
    if len(contact) != 4 or sha(contact) != CONTACT_OFFSET_SHA256:
        raise ValueError('extractor contact offset span hash mismatch')
    frame_holds, profiles = [], []
    for grade in range(3):
        action = grade + 1
        animation = read_animation_holds(raw, action)
        first = (3 + grade * 20) * FRAME_BYTES
        if (animation['firstFrameOffset'] != first
                or animation['lastFrameOffset'] != first + 19 * FRAME_BYTES
                or len(animation['holds']) != 20 or animation['flags'] != 0):
            raise ValueError('unsupported extractor running animation geometry')
        frame_holds.append(animation['holds'])
        profiles.append({
            'grade': grade, 'action': action, 'resource': 'BMINE.ANB',
            'resourceSha256': BMINE_DECODED_SHA256, 'resourceBytes': len(raw),
            'frameTableOffset': animation['frameTableOffset'],
            'animationTableOffset': animation['animationTableOffset'],
            'firstFrameOffset': animation['firstFrameOffset'],
            'lastFrameOffset': animation['lastFrameOffset'],
            'frameStride': FRAME_BYTES, 'holdByteOffsetWithinFrame': 10,
            'flags': animation['flags'],
        })
    return {'schemaVersion': 1,
            'contactOffset': list(struct.unpack('<hh', contact)),
            'frameHolds': frame_holds,
            'provenance': {'sourceVersion': SOURCE_VERSION,
                           'executableSha256': EXECUTABLE_SHA256,
                           'originalExecution': False,
                           'contactOffset': {'object': 3, 'objectOffset': 0x4574,
                                             'bytes': 4, 'sha256': CONTACT_OFFSET_SHA256},
                           'animationProfiles': profiles}}
