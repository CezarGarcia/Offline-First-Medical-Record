/**
 * Verificador da senha para o login offline (docs/08, seção 8.5): scrypt com sal aleatório. É lento de
 * propósito, para que testar senhas no chute a partir de uma cópia do banco seja caro. A senha nunca é gravada.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMETROS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAMANHO = 32;

function derivar(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha.normalize('NFC'), sal, TAMANHO, PARAMETROS, (erro, chave) => (erro ? rejeitar(erro) : resolver(chave)));
  });
}

export async function criarVerificador(senha: string): Promise<{ verificador: string; sal: string }> {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal);
  return { verificador: chave.toString('base64'), sal: sal.toString('base64') };
}

export async function senhaConfere(senha: string, verificador: string, sal: string): Promise<boolean> {
  const esperado = Buffer.from(verificador, 'base64');
  const obtido = await derivar(senha, Buffer.from(sal, 'base64'));
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}
