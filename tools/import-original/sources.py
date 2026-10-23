"""Read loose installations, flat ZIPs and MODE1/2352 or ISO2048 images safely."""
import hashlib
import struct
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILE = 64 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def clean(name):
    name = name.replace('\\', '/').split(';')[0].upper()
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or ':' in name:
        raise ValueError('unsafe source path')
    return str(p)


class Source:
    def __init__(self, path):
        self.path = Path(path).resolve()
        self.files, self.archive, self.stream = {}, None, None
        self.source_hash = digest(self.path) if self.path.is_file() else None
        if self.path.is_dir():
            for f in sorted(self.path.rglob('*')):
                if f.is_symlink():
                    raise ValueError('source symlinks are not supported')
                if f.is_file():
                    self.add(str(f.relative_to(self.path)), f)
        elif zipfile.is_zipfile(self.path):
            self.archive = zipfile.ZipFile(self.path)
            for info in self.archive.infolist():
                if not info.is_dir():
                    self.add(info.filename, info)
        else:
            self.stream = self.path.open('rb')
            prefix = self.stream.read(16)
            self.sector_size, self.bias = (2352, 16) if prefix[:12] == b'\0'+b'\xff'*10+b'\0' else (2048, 0)
            pvd = self.sector(16)
            if pvd[:7] != b'\x01CD001\x01':
                raise ValueError('source is not an installation, flat ZIP, ISO2048 or MODE1/2352 disc image')
            root = pvd[156:190]
            self.walk(struct.unpack_from('<I', root, 2)[0], struct.unpack_from('<I', root, 10)[0], '', set())

    def add(self, name, value):
        name = clean(name)
        if name in self.files:
            raise ValueError('ambiguous duplicate source path')
        self.files[name] = value

    def sector(self, lba):
        self.stream.seek(lba*self.sector_size)
        data = self.stream.read(self.sector_size)
        if len(data) != self.sector_size or self.bias and (data[:12] != b'\0'+b'\xff'*10+b'\0' or data[15] != 1):
            raise ValueError('invalid/truncated MODE1 sector')
        return data[self.bias:self.bias+2048]

    def extent(self, lba, size):
        if not 0 <= size <= MAX_FILE:
            raise ValueError('source file exceeds 64 MiB bound')
        return b''.join(self.sector(lba+i) for i in range((size+2047)//2048))[:size]

    def walk(self, lba, size, parent, seen):
        if lba in seen or len(parent.split('/')) > 16 or len(self.files) > 20000:
            raise ValueError('cyclic or excessive ISO directory tree')
        seen = seen | {lba}
        data, pos = self.extent(lba, size), 0
        while pos < len(data):
            length = data[pos]
            if length == 0:
                pos = (pos//2048+1)*2048
                continue
            record = data[pos:pos+length]
            if length < 34 or len(record) != length or 33+record[32] > length:
                raise ValueError('malformed ISO directory record')
            pos += length
            name = record[33:33+record[32]]
            if name in (b'\0', b'\1'):
                continue
            if record[1] or record[25] & 0x80 or record[26] or record[27]:
                raise ValueError('unsupported extended/interleaved/multiextent ISO record')
            name = clean(parent + name.decode('ascii'))
            start, count = struct.unpack_from('<I', record, 2)[0], struct.unpack_from('<I', record, 10)[0]
            if record[25] & 2:
                self.walk(start, count, name+'/', seen)
            else:
                self.add(name, (start, count))

    def find(self, suffix):
        suffix = clean(suffix)
        found = [p for p in self.files if p == suffix or p.endswith('/'+suffix)]
        preferred = [p for p in found if p.startswith('GAME/')]
        found = preferred or found
        if len(found) != 1:
            raise ValueError(f'expected exactly one {suffix}, found {len(found)}; nested archive packages require an extracted disc image')
        return found[0]

    def read(self, name):
        value = self.files[name]
        if isinstance(value, tuple):
            return self.extent(*value)
        size = value.file_size if self.archive else value.stat().st_size
        if size > MAX_FILE:
            raise ValueError('source file exceeds 64 MiB bound')
        return self.archive.read(value) if self.archive else value.read_bytes()

    def close(self):
        if self.archive:
            self.archive.close()
        if self.stream:
            self.stream.close()
