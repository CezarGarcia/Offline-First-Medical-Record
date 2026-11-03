/**
 * UUID versão 7 (RFC 9562): começa pela hora em que foi criado, então fica em ordem nos índices do banco.
 * Quem cria o registro gera o ID, e o ID é a chave de idempotência (D-09).
 */
export function uuid7(agora: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const milissegundos = BigInt(agora);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((milissegundos >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versão 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 9562
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function eUuid(texto: string): boolean {
  return FORMATO_UUID.test(texto.trim());
}
