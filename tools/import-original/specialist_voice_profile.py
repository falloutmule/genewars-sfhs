"""Hash-admitted specialist speech filenames and existing SPE key bindings.

No original strings, samples, instructions or process pointers are embedded in
this module. Only the normalized private profile contains the resource names.
"""
import re
import struct
from rules import LEImage, EXECUTABLE_SHA256, MAX_FILE_BYTES, sha

# All spans are in LE object3; pointers are object-relative before relocation.
SPANS = {
    'descriptorClasses': (0x5F60, 100, 'c9d98fe3d69fd7ce139b109b8f3e242a8fc457948e94a1bd6b4847b15e2aab54'),
    'styleChars': (0x608C, 4, '806cbc10b4d7c78b506dd2365a8a3c181a3b932fae8367d189ef85d24ff36f53'),
    'categoryPointers': (0x6090, 16, 'c388420929b1f6d10b4f6c12407c0441562ea72098ddea16fc163a6abd725eee'),
    'categoryStrings': (0xE0BD, 16, 'e252796850b78f53e1b481256034f6c5b1211bbcfa50958928d45ac29a763587'),
    'filenameFormat': (0xDF84, 20, '670a640c29d70796c64ca325174919d42ccf10f5d6f4428e16128728d6f55b13'),
    'bundlePointers': (0x6028, 72, '1486dafa7c8aac2099f9376a31b4ffe57a06a15807335320750c01ac0e5ad559'),
    'bundleStrings': (0xDA9C, 288, '2c4d7d3ddb8ffe03c343dd13fed646515c697aa38f3e8a052a2563f14a731f90'),
}


def _cstring(raw, base, pointer):
    at = pointer - base
    if not 0 <= at < len(raw):
        raise ValueError('speech string pointer outside admitted span')
    end = raw.find(b'\0', at)
    if end < 0:
        raise ValueError('unterminated admitted speech string')
    try:
        value = raw[at:end].decode('ascii')
    except UnicodeDecodeError as error:
        raise ValueError('non-ASCII speech string') from error
    if not value or len(value) >= 64 or '..' in value or ':' in value or value.startswith(('/', '\\')):
        raise ValueError('unsafe speech resource name')
    return value


def import_specialist_voice_profile(executable_bytes):
    """Resolve16 style/category rows to419E0 filenames and40360 SPE rows.

    Samples already imported under UPPERCASE-BASENAME.SPE:zeroBasedIndex are
    resolved by the consumer. This reader does not extract or duplicate waves.
    """
    if not isinstance(executable_bytes, (bytes, bytearray, memoryview)):
        raise ValueError('specialist voice input must be executable bytes')
    if len(executable_bytes) > MAX_FILE_BYTES or sha(executable_bytes) != EXECUTABLE_SHA256:
        raise ValueError('unrecognized specialist voice executable variant')
    image, spans, provenance = LEImage(executable_bytes), {}, []
    for name, (offset, length, expected) in SPANS.items():
        data = image.read_object(3, offset, length)
        if len(data) != length or sha(data) != expected:
            raise ValueError('specialist voice table hash mismatch: ' + name)
        spans[name] = data
        provenance.append({'name': name, 'object': 3, 'objectOffset': offset,
                           'bytes': length, 'sha256': expected})
    try:
        styles = spans['styleChars'].decode('ascii')
        pattern = spans['filenameFormat'].decode('ascii')
    except UnicodeDecodeError as error:
        raise ValueError('non-ASCII specialist voice format') from error
    if len(styles) != 4 or len(set(styles)) != 4 or not styles.isalpha():
        raise ValueError('invalid speech style characters')
    form = re.fullmatch(r'([A-Za-z0-9_\\/-]+)%c%s%03d(\.[A-Za-z0-9]+)\x00', pattern)
    if not form or '..' in form[1] or form[1].startswith(('/', '\\')):
        raise ValueError('unsupported specialist voice filename format')
    category_base = SPANS['categoryStrings'][0]
    categories = [_cstring(spans['categoryStrings'], category_base, p)
                  for p in struct.unpack('<4I', spans['categoryPointers'])]
    if len(set(categories)) != 4 or any(not c.isalpha() or len(c) != 3 for c in categories):
        raise ValueError('invalid speech category tokens')
    bundle_base = SPANS['bundleStrings'][0]
    bundles = [_cstring(spans['bundleStrings'], bundle_base, p)
               for p in struct.unpack('<18I', spans['bundlePointers'])]
    if len(set(bundles)) != 18:
        raise ValueError('duplicate speech bundle name')
    rows = []
    for style, char in enumerate(styles):
        for category, token in enumerate(categories):
            stem = form[1] + char + token
            matches = [(i, b) for i, b in enumerate(bundles)
                       if b.rsplit('.', 1)[0].casefold() == stem.casefold()]
            if len(matches) != 1:
                raise ValueError('specialist voice bundle binding is ambiguous or missing')
            bundle_index, bundle = matches[0]
            rows.append({'style': style, 'category': category,
                         'filenamePrefix': stem, 'filenameSuffix': form[2],
                         'speechContainer': bundle, 'bundleIndex': bundle_index,
                         'soundKeyPrefix': bundle.replace('\\', '/').rsplit('/', 1)[-1].upper() + ':'})
    return {'schemaVersion': 1, 'rows': rows,
            'descriptorClasses': list(spans['descriptorClasses']), 'provenance': {
        'executableSha256': EXECUTABLE_SHA256, 'originalExecution': False,
        'sourceSpans': provenance, 'nativePointersOmitted': True,
        'consumer': '4FF40 formats variant4/5;419E0 policy0;40360 parses decimal filename suffix and subtracts1 for SPE row.',
        'limits': ['Only specialist damage variants4/5 are bound by this module.',
                   'No effect cue, subtitle index or shared415C0 allocation success is inferred.']}}
