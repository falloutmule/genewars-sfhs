"""Hash-admitted private economy profile for the audited QA BETA V5 CD.

The mechanics coefficients below are independently expressed from established
source contracts. Animation holds are read from caller-supplied decoded BMINE;
they are never supplied as literals or synthesized for unsupported grades.
This module does not read or execute the original executable. Its caller must
verify the executable bytes and pass that verified identity explicitly.
"""
import hashlib
import struct


SOURCE_VERSION = 'qa-beta-v5-cd'
EXECUTABLE_SHA256 = '4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba'
BMINE_DECODED_SHA256 = '218b117a4b0f84c6e5a362e5afdc46d29fb1525930c6131e2ffff3bcfcda2142'
BMINE_DECODED_BYTES = 34955
BMINE_SECTION_OFFSETS = (32421, 32691, 33981, 34905)
FRAME_BYTES = 14
ANIMATION_BYTES = 10


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def read_animation_holds(decoded_anb, animation_index):
    """Read an ANB animation's hold bytes with no pixel/palette dependency.

    This is a bounded format reader, not a source admission API. Only
    import_economy_rules supplies an admitted original economy profile.
    """
    if not isinstance(decoded_anb, (bytes, bytearray, memoryview)):
        raise ValueError('decoded ANB must be bytes')
    raw = bytes(decoded_anb)
    if len(raw) < 18 or len(raw) > 64 * 1024 * 1024:
        raise ValueError('decoded ANB size outside bound')
    count, sprites, components, frames, animations = struct.unpack_from('<HIIII', raw)
    if (not 18 <= sprites <= components <= frames <= animations <= len(raw)
            or (components - sprites) % 6 or (frames - components) % 10
            or (animations - frames) % FRAME_BYTES
            or len(raw) - animations != count * ANIMATION_BYTES):
        raise ValueError('invalid ANB section layout')
    if (not isinstance(animation_index, int) or isinstance(animation_index, bool)
            or not 0 <= animation_index < count):
        raise ValueError('ANB animation index out of range')
    first, last, trailing = struct.unpack_from(
        '<IIH', raw, animations + animation_index * ANIMATION_BYTES)
    frame_table_bytes = animations - frames
    if (first % FRAME_BYTES or last % FRAME_BYTES or first > last
            or last >= frame_table_bytes):
        raise ValueError('invalid ANB animation frame range')
    frame_count = (last - first) // FRAME_BYTES + 1
    # The source animation record's low byte is the declared frame count;
    # the high byte contains playback flags. Neither is guessed from pixels.
    if frame_count > 255 or trailing & 255 != frame_count:
        raise ValueError('ANB animation frame-count mismatch')
    holds = [raw[frames + offset + 10]
             for offset in range(first, last + FRAME_BYTES, FRAME_BYTES)]
    return {
        'holds': holds,
        'flags': trailing >> 8,
        'firstFrameOffset': first,
        'lastFrameOffset': last,
        'frameTableOffset': frames,
        'animationTableOffset': animations,
    }


def import_economy_rules(decoded_bmine, *, executable_sha256, source_version):
    """Return JSON-compatible EconomyRules plus explicit source provenance.

    executable_sha256 must be the identity of bytes already validated by the
    caller, not a requested target variant. Both executable and decoded asset
    admission are mandatory. Input buffers are not mutated or retained.
    """
    if source_version != SOURCE_VERSION:
        raise ValueError('unsupported economy source version')
    if executable_sha256 != EXECUTABLE_SHA256:
        raise ValueError('unsupported economy executable identity')
    if not isinstance(decoded_bmine, (bytes, bytearray, memoryview)):
        raise ValueError('decoded BMINE must be bytes')
    raw = bytes(decoded_bmine)
    if len(raw) != BMINE_DECODED_BYTES:
        raise ValueError('unsupported decoded BMINE length')
    resource_hash = _sha(raw)
    if resource_hash != BMINE_DECODED_SHA256:
        raise ValueError('unsupported decoded BMINE identity')
    count, *offsets = struct.unpack_from('<HIIII', raw)
    if count != 5 or tuple(offsets) != BMINE_SECTION_OFFSETS:
        raise ValueError('unsupported BMINE section layout')
    running = read_animation_holds(raw, 1)
    if (running['firstFrameOffset'] != 3 * FRAME_BYTES
            or len(running['holds']) != 20 or running['flags'] != 0):
        raise ValueError('unsupported BMINE grade0 running animation')

    evidence_root = 'preservation:genewars-preflight/'
    power_evidence = evidence_root + 'research/variants/building-power.md'
    extractor_evidence = evidence_root + 'research/campaign/mission-001-contract.md'
    capacity_evidence = evidence_root + 'rust/crates/genewars-runtime/src/building_progress.rs::recompute_player_capacity'
    bookkeeping_evidence = evidence_root + 'rust/crates/genewars-runtime/src/bookkeeping.rs'
    return {
        'evidence': (SOURCE_VERSION + '; executable-sha256=' + executable_sha256
                     + '; decoded-BMINE-sha256=' + resource_hash
                     + '; source451F0/4C8E6/43620/437A0; grade0-animation-admitted'),
        'cellSize': 1 << 8,
        'power': {
            'distributorGeneration': [max(grade * 4, 2) for grade in range(3)],
            'distributorRange': [1536 + grade * 768 for grade in range(3)],
            'distributorCapacity': 2000,
            'distributorPulsePeriod': 64,
            'distributorPulsePhase': [grade * 16 for grade in range(3)],
            'photonReleaseThreshold': 199,
            'photonReleaseAmount': 200,
            'packetPayloadCap': (1 << 8) - 1,
            'consumerCapacity': 200,
            'deliveryRadius': 128,
            'noPowerWarningTicks': 1000,
            'noPowerWarningCooldownTicks': 800,
        },
        'extractor': {
            'upkeep': 1,
            'harvestRadius': 3,
            'harvestUnits': [2 * (grade + 1) for grade in range(3)],
            'goopPerResource': 2,
            'cycleLength': 240,
            'startFrame': 1,
            'resetFrame': 17,
            'harvestFrames': list(range(7, 11)),
            'workDelay': 5,
            'harvestExtraDrain': 3,
            'frameHolds': [running['holds'], [], []],
        },
        'capacity': {
            'extractor': 600,
            'store4': [(grade + 1) * 400 for grade in range(3)],
            'store13': [(grade + 1) * 500 for grade in range(3)],
            'unusedGoopWarningTicks': 1000,
        },
        'supportedExtractorGrades': [0],
        'unsupportedExtractorGrades': [1, 2],
        'provenance': {
            'sourceVersion': SOURCE_VERSION,
            'executableSha256': executable_sha256,
            'resource': {
                'name': 'BMINE.ANB',
                'representation': 'decoded-original-bytes',
                'bytes': len(raw),
                'sha256': resource_hash,
            },
            'constantDerivedFields': [
                {'fields': ['cellSize'], 'source': extractor_evidence,
                 'derivation': 'Source world coordinates use eight fractional cell bits.'},
                {'fields': ['power.distributorGeneration', 'power.distributorRange',
                            'power.distributorCapacity', 'power.distributorPulsePeriod',
                            'power.distributorPulsePhase', 'power.photonReleaseThreshold',
                            'power.photonReleaseAmount', 'power.packetPayloadCap',
                            'power.consumerCapacity', 'power.deliveryRadius'],
                 'source': power_evidence,
                 'derivation': 'Independently expressed source451F0 producer and4C8E6 delivery constants/formulas; not a copied binary table.'},
                {'fields': ['power.noPowerWarningTicks', 'power.noPowerWarningCooldownTicks'],
                 'source': bookkeeping_evidence,
                 'derivation': 'Source exhaustion warning trigger and47F80 player-tail cooldown constants.'},
                {'fields': ['extractor.upkeep', 'extractor.harvestRadius', 'extractor.harvestUnits',
                            'extractor.goopPerResource', 'extractor.cycleLength', 'extractor.startFrame',
                            'extractor.resetFrame', 'extractor.harvestFrames', 'extractor.workDelay',
                            'extractor.harvestExtraDrain'],
                 'source': extractor_evidence,
                 'derivation': 'Independently expressed source451F0 gates/cadence and46F0C harvest constants/formulas; no resource rates inferred.'},
                {'fields': ['capacity.extractor', 'capacity.store4', 'capacity.store13'],
                 'source': capacity_evidence,
                 'derivation': 'Source43620 per-selector supply formulas, independent of store allocation behavior.'},
                {'fields': ['capacity.unusedGoopWarningTicks'], 'source': bookkeeping_evidence,
                 'derivation': 'Source437A0 unallocated-positive-secondary-resource warning constant.'},
            ],
            'binaryDerivedFields': [{
                'field': 'extractor.frameHolds[0]',
                'source': 'BMINE.ANB',
                'sha256': resource_hash,
                'animation': 1,
                'grade': 0,
                'frameTableOffset': running['frameTableOffset'],
                'firstFrameOffset': running['firstFrameOffset'],
                'lastFrameOffset': running['lastFrameOffset'],
                'frameStride': FRAME_BYTES,
                'holdByteOffsetWithinFrame': 10,
                'animationFlags': running['flags'],
                'derivation': 'Read each admitted running-frame hold byte from the decoded original ANB; no literal/synthetic hold fallback.',
            }],
            'unsupported': [
                'Extractor grade1/2 full callback animation admission; empty hold arrays deliberately reject those callbacks.',
                'Generic consumer production, combat and specialized resource consumption.',
                'Selector4/13 storage allocation bodies; capacity formulas alone do not admit allocation.',
                'Selector12 conditional power-recipient effects.',
                'Power packet allocation/replacement/physics and producer RNG/audio timing.',
                'Host contact/damage, terrain cleanup, presentation, full player history/countdown and source frame parity.',
                'Canonical mission acceptance for the TypeScript implementation.',
            ],
        },
    }
