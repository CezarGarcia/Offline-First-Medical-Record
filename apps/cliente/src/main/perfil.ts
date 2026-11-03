/**
 * `--perfil=<nome>` (D-29): cada perfil tem a própria pasta de dados (outro SQLite, outra configuração), então
 * dois atalhos no mesmo PC funcionam como duas ambulâncias. Sem o parâmetro, o perfil é "padrao".
 */
export const PERFIL_PADRAO = 'padrao';

export function perfilDaLinhaDeComando(argumentos: string[]): string {
  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i] ?? '';
    const valor = argumento.startsWith('--perfil=') ? argumento.slice('--perfil='.length) : argumento === '--perfil' ? argumentos[i + 1] : null;
    if (valor !== null && valor !== undefined) return limparPerfil(valor);
  }
  return PERFIL_PADRAO;
}

/** Só letras, números, "-" e "_": o nome vira uma pasta. */
export function limparPerfil(valor: string): string {
  const limpo = valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return limpo || PERFIL_PADRAO;
}
