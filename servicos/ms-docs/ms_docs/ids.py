"""UUID versão 7 (RFC 9562): começa pela hora em que foi criado, então fica em ordem no índice. Mesmo padrão
dos outros serviços e do cliente (D-09). O Python só ganha uuid.uuid7() na versão 3.14."""

import os
import time
import uuid


def uuid7() -> uuid.UUID:
    milissegundos = time.time_ns() // 1_000_000
    aleatorio = int.from_bytes(os.urandom(10))
    valor = (milissegundos & ((1 << 48) - 1)) << 80  # 48 bits de hora
    valor |= 0x7 << 76  # versão 7
    valor |= ((aleatorio >> 62) & 0xFFF) << 64  # 12 bits aleatórios
    valor |= 0b10 << 62  # variante RFC 9562
    valor |= aleatorio & ((1 << 62) - 1)  # 62 bits aleatórios
    return uuid.UUID(int=valor)
