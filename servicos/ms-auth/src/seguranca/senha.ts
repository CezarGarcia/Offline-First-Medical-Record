import bcrypt from 'bcryptjs';

let hashFicticio: Promise<string> | undefined;

/**
 * Confere a senha com o hash bcrypt (o mesmo formato gerado por crypt() do pgcrypto).
 * Sem hash (registro inexistente), compara com um hash fictício: assim a resposta
 * demora o mesmo tempo e não revela se o registro existe.
 */
export async function conferirSenha(senha: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    hashFicticio ??= bcrypt.hash('senha-ficticia-para-tempo-constante', 10);
    await bcrypt.compare(senha, await hashFicticio);
    return false;
  }
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}
