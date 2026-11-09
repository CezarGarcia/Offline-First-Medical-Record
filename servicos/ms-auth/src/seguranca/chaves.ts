import { createPrivateKey, createPublicKey } from 'node:crypto';

/** Onde procurar quando uma chave do JWT não serve (aparece no log do container). */
export const COMO_GERAR_CHAVES =
  'Apague as duas chaves da pasta infra/secrets e gere de novo: no Linux, com o infra/scripts/instalar.sh; ' +
  'no Windows, com o infra/scripts/instalar.ps1 ou o gerar-chaves-jwt.ps1 (docs/12-implantacao.md, seção 12.11).';

type Cabecalho = 'PRIVATE KEY' | 'PUBLIC KEY';

/**
 * Explica o que há de errado no texto de uma chave PEM, ou devolve undefined se o formato está certo.
 * Os casos são os que aparecem quando a chave é gerada à mão no Windows: o PowerShell grava com BOM
 * ou em UTF-16, e geradores antigos usam o PKCS#1 ("BEGIN RSA ...").
 */
export function problemaNoPem(texto: string, cabecalho: Cabecalho): string | undefined {
  if (texto.trim() === '') return 'o arquivo está vazio';
  if (texto.startsWith('﻿')) {
    return 'o arquivo começa com um BOM ("UTF-8 com BOM", jeito do PowerShell gravar arquivos)';
  }
  if (texto.includes('\u0000') || texto.startsWith('�')) {
    return 'o arquivo está em UTF-16 (o "openssl ... > arquivo" do PowerShell grava assim)';
  }
  if (texto.includes(`-----BEGIN RSA ${cabecalho}-----`)) {
    return `a chave está no formato PKCS#1 ("BEGIN RSA ${cabecalho}"); o esperado é "BEGIN ${cabecalho}"`;
  }
  if (!texto.trim().startsWith(`-----BEGIN ${cabecalho}-----`)) {
    return `o arquivo não começa com "-----BEGIN ${cabecalho}-----"`;
  }
  return undefined;
}

/**
 * Confere o par de chaves antes de o serviço subir: o formato de cada uma, se são RSA e se a pública
 * é mesmo a da privada (senão o ms-clinico e o ms-docs recusariam todos os tokens). Devolve as duas
 * sem espaços nas pontas; lança um erro que diz o que fazer.
 */
export function conferirChaves(
  privadaPem: string,
  publicaPem: string,
  arquivos: { privada: string; publica: string },
): { privadaPem: string; publicaPem: string } {
  const falha = (qual: string, arquivo: string, motivo: string) =>
    new Error(`A chave ${qual} do JWT em ${arquivo} não serve: ${motivo}. ${COMO_GERAR_CHAVES}`);

  const problemaPrivada = problemaNoPem(privadaPem, 'PRIVATE KEY');
  if (problemaPrivada) throw falha('privada', arquivos.privada, problemaPrivada);
  const problemaPublica = problemaNoPem(publicaPem, 'PUBLIC KEY');
  if (problemaPublica) throw falha('pública', arquivos.publica, problemaPublica);

  let privada;
  try {
    privada = createPrivateKey(privadaPem);
  } catch (erro) {
    throw falha('privada', arquivos.privada, `não foi possível lê-la (${(erro as Error).message})`);
  }
  let publica;
  try {
    publica = createPublicKey(publicaPem);
  } catch (erro) {
    throw falha('pública', arquivos.publica, `não foi possível lê-la (${(erro as Error).message})`);
  }
  if (privada.asymmetricKeyType !== 'rsa') {
    throw falha('privada', arquivos.privada, `ela é ${privada.asymmetricKeyType}, e o token usa RSA (RS256)`);
  }

  const daPrivada = createPublicKey(privada).export({ type: 'spki', format: 'der' });
  if (!daPrivada.equals(publica.export({ type: 'spki', format: 'der' }))) {
    throw falha('pública', arquivos.publica, 'ela não é a pública da chave privada (as duas devem ser geradas juntas)');
  }
  return { privadaPem: privadaPem.trim(), publicaPem: publicaPem.trim() };
}
