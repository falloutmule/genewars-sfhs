"""Hash-admitted packed-four-bit ANB assets, retaining runtime palette choices.

No encoding is selected from filenames or visual appearance. MAIN.PAL's first
sixteen colors are never substituted for the creature palette banks.
"""
import base64
import hashlib
import importlib.util
import struct
from pathlib import Path

_spec = importlib.util.spec_from_file_location('gw_packed4_png', Path(__file__).with_name('codecs.py'))
_codec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_codec)
MAX_BYTES = 64 * 1024 * 1024
MAX_PIXELS = 16 * 1024 * 1024
MULE_SHA256 = 'f6c62221b52a62088f91ae8d00becfef513282cbf98a5990c1a0859cd8b2d346'
BONES_SHA256 = '2106ce79deaafe53d5fbb6292c78a8c71fb6920b08d1a11b5c44ea3b0ab75e9f'
PIXEL_SHA256 = {
    '0c9d9dbbcb29e39ab29aac17eca97da9a404791febdb79123b6c0eb44af78767': '1fb4840ac740b4c719e527128a4b7ddb4e9ae5bf58c9c4eea7e011f877f4a2c7',
    '14a75aa9a0787ad041b80c384ea9a268edf7f5ef30c4ac4d6661bfe363bcd81e': 'd94e941c07c2b68c13e4bae62db6481ed8417fd62fcf5db95e0a8c7d304cc940',
    '841e7772da00934befd3e8055c6ee9c8487735c73d1d10e383a5c7b715cb4ce3': '3b2205dd6e7fdd8ce1b9d5f5faf5d153afcb39172847a64649c7600a9076b8e4',
    '5ba1cc74cc4f2dfec20e0cad9b5656a59bc9e93c8c626a8caf562ea7800b79ec': '8228d7065dbfcf4540ebfa370ac0b44f7937d739c71ffa8b93edbfb3ef82fc95',
    'f6c62221b52a62088f91ae8d00becfef513282cbf98a5990c1a0859cd8b2d346': '7a29fd10fa36495096f7af256b29117d5dbac16c23812f93335a1e5d403813c5',
    'fe1fb252f9c2fddb1bb32625acd4624087ac3a17828c51c96256167e352bbe00': '2b65138a33ea8f8fd33a8dd6346726d51a2fa44ab93b10190201b8169591989d',
    '10b7fdb9fedfdd18fa2189fc8e142a6f3d942dd81db38433b373559edec6c854': '1ac4727a7dd7edf4cf0289940e85bfc6ba4b1fc048a0756f520169eef58168be',
    'd2c46b9948c05491f730f9c8e3a51b5bb509fe92416ce711e371711e9879eb80': 'd23118a026281118d02ae898bde84565bfaec139744b9ffc49cc892f54755536',
    '382182e0e1c7778ffc66b5dcdd5bdf6288d6ac72135946edc854cc5f55a06ef2': '68d30b5753e43a5d2306d4eb546b9e5e026cb8d3ba329ddd4775f69dfb7de1b1',
    '1483536ff084d24a4898166756d058ccc5be4b38a0a3b90f3b3a7d55c6c7fb04': '3bb413ff7bf552bcaaff8a984aba61b2db04c5340a7a00e1300b557b52d94c5e',
    '9a588b42098597778560ba95a890529efa2b25969e2b162849441cfb72e478cc': 'a0af0cf81a848be6546d870d1157ea49ef084fb6c9ffa521e39f13b4a319b0f4',
    '380caaeefa791bc2735cad0f460639794ff2e42adffe2c97e27902829780ac2e': '8e7bd53caf5923bd20ee7452c3c23b2da36e75efa33ec5dd547923d267b5bb28',
    '241287861ce99cb867879e5a34877407d9389393b5b0337755418cc09bfaff00': '6b22bdd61b60e7a463daea00de201514f488c8825f05274175627b59650e49f6',
    '92cf65b5c0b9989fa35868c8ef69dc0bb18993750dc96d79bf715b863b16fad1': 'ab1db87d953071fefcc7671b31f2075088b5d9969c83e10727ea85d37acb602e',
    '82ee6a6f05fad2de224049f6d9b80ba1ba5a746e439d2361f3a993a622a029ee': '35f980bd59a4905e4aa139133aa37b4e43197547069c96f3f9c584046ea41367',
    'bdbba070209f032194286a928bc50b461be38fd981ca394325e330c5c96625ca': 'd7f1746ae8d12ee33da1b4403fb12d3f1f5a4000fc531f6bcbe7f7bade2baf74',
    'dc71401469ecb4e5a47634f932a9a517686fc188881579c600fea22b1d90baa8': '5150057fcf996fc9bfe7fc7ba70abb0e0ae66be432fe4d45eb21d1e51b8e5d83',
    '175383dc29ebfdf56c08f44d3a53719a7f9a3fdce0530d24ce5b237db7d1ca42': 'd804f88beb8730c98d04ce83919ba10af4e5759d035fc5e2ad82226fb8d0688c',
    '39fefa9ac416bccfae2c069150a0e066d8ca7eb580b502d9253af9c86bc82475': '92010f5e38f301324c92ff6c6a915707e7093d72d91a02a2d550ead9e857425b',
    '2f5e7e8fb8268017bc313fa888f8232a88e515fd77d9133a719d37d7ec53b6b6': 'd4c253076220cda5b7ca6bb8383752459d027cd990cf2b37507f27813de0e06a',
    'c793e0f2ba034cee39e0bac7c9cffcdf3d24461605f09945d95485c41a57ed8d': 'bb0d8cb8ead0f6df574f2a56c9fd6581281d168e7602e963af6c026bda53b8e6',
    'c141a7f5be79141aa570ff0f0086d916d09f15223fd72f0d85309146a17fe287': 'a740957c1cd96814d5f8b6abdcf4a636d2f12fde7bfe8765d1f120ca5d4b1da4',
    '32c43a3e485b07d5cbccc36ede1465d170b09e7a9fa8445a1badb041217fd55e': '7b465e01d6c688459fd963f9376c24b6a8bcf09f3a87b6eb79639bdddc5bd2ff',
    '273bc86685a7512629592abdad2c9059b75c81ef4959e92f22ef345ee47dcfa2': '474f1574f89144930c5ec6314abe048134e6b51183d39b689521bb2b66827381',
    '93fce7be86fe31c4dbb94d90513255b8c3c58891d6284a458709ef587afe9edb': '03c1e4f5347eef5c45f1b9f122d48b85f752d73ad46cf41254ab2802f858cfff',
    '2106ce79deaafe53d5fbb6292c78a8c71fb6920b08d1a11b5c44ea3b0ab75e9f': '32d0057b0427dcdfc881def1403ff8abf8486c1ffccde293534d76ce79835e0f',
}
# Static caller/loader admissions, not proprietary sprite or palette contents.
ADMITTED = {
    '0c9d9dbbcb29e39ab29aac17eca97da9a404791febdb79123b6c0eb44af78767': 'dino',
    '14a75aa9a0787ad041b80c384ea9a268edf7f5ef30c4ac4d6661bfe363bcd81e': 'crab',
    '841e7772da00934befd3e8055c6ee9c8487735c73d1d10e383a5c7b715cb4ce3': 'frog',
    '5ba1cc74cc4f2dfec20e0cad9b5656a59bc9e93c8c626a8caf562ea7800b79ec': 'bird',
    MULE_SHA256: 'mule',
    'fe1fb252f9c2fddb1bb32625acd4624087ac3a17828c51c96256167e352bbe00': 'dinocrab',
    '10b7fdb9fedfdd18fa2189fc8e142a6f3d942dd81db38433b373559edec6c854': 'dinofrog',
    'd2c46b9948c05491f730f9c8e3a51b5bb509fe92416ce711e371711e9879eb80': 'dinobird',
    '382182e0e1c7778ffc66b5dcdd5bdf6288d6ac72135946edc854cc5f55a06ef2': 'dinomule',
    '1483536ff084d24a4898166756d058ccc5be4b38a0a3b90f3b3a7d55c6c7fb04': 'crabfrog',
    '9a588b42098597778560ba95a890529efa2b25969e2b162849441cfb72e478cc': 'crabbird',
    '380caaeefa791bc2735cad0f460639794ff2e42adffe2c97e27902829780ac2e': 'crabmule',
    '241287861ce99cb867879e5a34877407d9389393b5b0337755418cc09bfaff00': 'frogbird',
    '92cf65b5c0b9989fa35868c8ef69dc0bb18993750dc96d79bf715b863b16fad1': 'frogmule',
    '82ee6a6f05fad2de224049f6d9b80ba1ba5a746e439d2361f3a993a622a029ee': 'birdmule',
    'bdbba070209f032194286a928bc50b461be38fd981ca394325e330c5c96625ca': 'crabdino',
    'dc71401469ecb4e5a47634f932a9a517686fc188881579c600fea22b1d90baa8': 'frogdino',
    '175383dc29ebfdf56c08f44d3a53719a7f9a3fdce0530d24ce5b237db7d1ca42': 'frogcrab',
    '39fefa9ac416bccfae2c069150a0e066d8ca7eb580b502d9253af9c86bc82475': 'birddino',
    '2f5e7e8fb8268017bc313fa888f8232a88e515fd77d9133a719d37d7ec53b6b6': 'birdcrab',
    'c793e0f2ba034cee39e0bac7c9cffcdf3d24461605f09945d95485c41a57ed8d': 'birdfrog',
    'c141a7f5be79141aa570ff0f0086d916d09f15223fd72f0d85309146a17fe287': 'muledino',
    '32c43a3e485b07d5cbccc36ede1465d170b09e7a9fa8445a1badb041217fd55e': 'mulecrab',
    '273bc86685a7512629592abdad2c9059b75c81ef4959e92f22ef345ee47dcfa2': 'mulefrog',
    '93fce7be86fe31c4dbb94d90513255b8c3c58891d6284a458709ef587afe9edb': 'mulebird',
    BONES_SHA256: 'bones',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def sprite_packed4(data, offset, width, height, bound, base=0):
    """Decode complete bounded rows to indices and a distinct0/1 opacity mask.

    Positive controls count pixels, not bytes. Clipping never changes how many
    packed bytes are consumed. Literal nibble0 is opaque. Odd low padding is
    ignored; negative controls leave transparent output positions.
    """
    for value, low, high in ((width, 0, 255), (height, 0, 255), (base, 0, 255)):
        if not isinstance(value, int) or not low <= value <= high:
            raise ValueError('invalid packed4 sprite dimensions/base')
    if not isinstance(offset, int) or offset < 0 or not 18 <= bound <= len(data):
        raise ValueError('invalid packed4 sprite bound')
    pixels, mask = bytearray(width*height), bytearray(width*height)
    if width == 0 or height == 0:
        return bytes(pixels), bytes(mask), 0
    start = 18+offset
    if start >= bound:
        raise ValueError('packed4 sprite points into metadata')
    cursor = start
    for row in range(height):
        x = 0
        while True:
            if cursor >= bound:
                raise ValueError('packed4 row crosses sprite metadata boundary')
            control = data[cursor]
            cursor += 1
            if control == 0:
                break
            if control >= 128:
                x = min(width, x+256-control)
                continue
            stored = (control+1)//2
            if stored > bound-cursor:
                raise ValueError('truncated packed4 literal payload')
            writable = min(control, width-x)
            for pixel in range(writable):
                packed = data[cursor+pixel//2]
                nibble = (packed >> 4) if pixel % 2 == 0 else (packed & 15)
                target = row*width+x+pixel
                pixels[target] = (base+nibble) & 255
                mask[target] = 1
            cursor += stored
            x = min(width, x+control)
    return bytes(pixels), bytes(mask), cursor-start


def decode_database(data):
    """Explicit structural decoder, also usable with synthetic fixtures."""
    if not isinstance(data, (bytes, bytearray)) or not 18 <= len(data) <= MAX_BYTES:
        raise ValueError('packed4 ANB size outside bound')
    count, sprite_table, components_at, frames_at, animations_at = struct.unpack_from('<H4I', data)
    if (not 18 <= sprite_table <= components_at <= frames_at <= animations_at <= len(data)
            or (components_at-sprite_table) % 6 or (frames_at-components_at) % 10
            or (animations_at-frames_at) % 14 or len(data)-animations_at != count*10):
        raise ValueError('invalid packed4 ANB section layout')
    descriptions, decoded, total = [], [], 0
    digest = hashlib.sha256()
    for index, position in enumerate(range(sprite_table, components_at, 6)):
        offset, width, height = struct.unpack_from('<IBB', data, position)
        total += width*height
        if total > MAX_PIXELS:
            raise ValueError('packed4 ANB pixel budget exceeded')
        pixels, mask, consumed = sprite_packed4(data, offset, width, height, sprite_table)
        descriptions.append({'record': index, 'width': width, 'height': height,
                             'consumedBytes': consumed, 'opaquePixels': sum(mask)})
        decoded.append((pixels, mask))
        digest.update(struct.pack('<IBB', index, width, height)+pixels+mask)
    components, source_components = [], []
    for position in range(components_at, frames_at, 10):
        ref, x, y, flags, extra = struct.unpack_from('<IhhBB', data, position)
        if ref % 6 or ref//6 >= len(decoded):
            raise ValueError('packed4 component sprite reference out of range')
        components.append([ref//6, x >> 1, y >> 1, flags, extra])
        source_components.append([ref//6, x, y, flags, extra])
    frames = []
    for position in range(frames_at, animations_at, 14):
        ref, width, height = struct.unpack_from('<Ihh', data, position)
        component_count = data[position+11]
        if ref % 10 or ref//10+component_count > len(components):
            raise ValueError('packed4 frame component range out of bounds')
        frames.append({'components': components[ref//10:ref//10+component_count],
                       'sourceComponents': source_components[ref//10:ref//10+component_count],
                       'sourceSize': [width, height],
                       'width': width >> 1, 'height': height >> 1,
                       'rawFlags': [data[position+10], data[position+12], data[position+13]]})
    animations = []
    for position in range(animations_at, len(data), 10):
        first, last, trailing = struct.unpack_from('<IIH', data, position)
        if first % 14 or last % 14 or first > last or last//14 >= len(frames):
            raise ValueError('packed4 animation frame range out of bounds')
        animations.append({'first': first//14, 'last': last//14, 'rawTrailingWord': trailing})
    return {'descriptions': descriptions, 'decoded': decoded, 'frames': frames,
            'animations': animations, 'pixelSha256': digest.hexdigest(),
            'sectionOffsets': [sprite_table, components_at, frames_at, animations_at]}


def _atlas(parsed, colors, base):
    records, x, y, row_height = [], 0, 0, 0
    for sprite in parsed['descriptions']:
        width, height = sprite['width'], sprite['height']
        if x+width > 1024:
            x, y, row_height = 0, y+row_height+1, 0
        records.append([x, y, width, height])
        x += width+1
        row_height = max(row_height, height)
    height = max(1, y+row_height)
    if height > 16384:
        raise ValueError('packed4 atlas exceeds height bound')
    rgba = bytearray(1024*height*4)
    for (left, top, width, rows), (pixels, mask) in zip(records, parsed['decoded']):
        for row in range(rows):
            for col in range(width):
                index = row*width+col
                if mask[index]:
                    destination = ((top+row)*1024+left+col)*4
                    rgba[destination:destination+4] = bytes((*colors[(base+pixels[index]) & 255], 255))
    return records, _codec.png(1024, height, rgba)


def anb_packed4(decoded, main_colors):
    """Import one hash-admitted asset, with both source neutral color banks.

    imageBytes is the bank192 preview. paletteAtlases retains bank208 too;
    runtime neutral rendering must select them using its actual screen parity,
    fade row and depth. Raw indices/masks remain available without color loss.
    """
    if not isinstance(decoded, (bytes, bytearray)) or not 18 <= len(decoded) <= MAX_BYTES:
        raise ValueError('packed4 ANB size outside bound')
    source_hash = sha(decoded)
    if source_hash not in ADMITTED:
        raise ValueError('packed4 source hash is not admitted: '+source_hash)
    if (len(main_colors) != 256 or any(len(color) != 3 or any(
            not isinstance(value, int) or not 0 <= value <= 255 for value in color) for color in main_colors)):
        raise ValueError('packed4 requires the bound 256-color RGB palette')
    parsed = decode_database(decoded)
    expected_pixels = PIXEL_SHA256.get(source_hash)
    if expected_pixels is not None and parsed['pixelSha256'] != expected_pixels:
        raise ValueError('packed4 decoded pixel/mask hash differs from independent reference')
    records, primary = _atlas(parsed, main_colors, 192)
    _, alternate = _atlas(parsed, main_colors, 208)
    indices = b''.join(pixels for pixels, _ in parsed['decoded'])
    opacity = b''.join(mask for _, mask in parsed['decoded'])
    neutral_proved = source_hash in (MULE_SHA256, BONES_SHA256)
    return {'sprites': records, 'frames': parsed['frames'], 'animations': parsed['animations'],
            'imageBytes': primary,
            'paletteMode': 'packed4-neutral-owner4-banks192-208' if neutral_proved else 'packed4-explicit-banks192-208-preview',
            'paletteAtlases': {'192': 'data:image/png;base64,'+base64.b64encode(primary).decode('ascii'),
                               '208': 'data:image/png;base64,'+base64.b64encode(alternate).decode('ascii')},
            'packed4': {'indices': base64.b64encode(indices).decode('ascii'),
                        'opacity': base64.b64encode(opacity).decode('ascii'),
                        'layout': 'concatenated sprite rows in sprite-record order; opacity0/1',
                        'pixelSha256': parsed['pixelSha256'],
                        'neutralPalette': {'owner': 4, 'bases': [192, 208], 'runtimeSelectionRequired': True,
                                           'sourceWrapper': '0x59470/0x94F30/0x93F80',
                                           'wrapperAdmission': neutral_proved},
                        'sourceSha256': source_hash, 'sourceKey': ADMITTED[source_hash],
                        'codec': 'packed4-high-first', 'sourceDataBase': 18,
                        'sectionOffsets': parsed['sectionOffsets'], 'descriptions': parsed['descriptions']}}
