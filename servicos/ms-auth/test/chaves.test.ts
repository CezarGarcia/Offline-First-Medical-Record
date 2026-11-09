import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { conferirChaves } from '../src/seguranca/chaves.js';

const arquivos = { privada: '/run/secrets/jwt-privada.pem', publica: '/run/secrets/jwt-publica.pem' };

function parRsa() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privadaPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicaPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privadaPkcs1: privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
  };
}

const par = parRsa();

describe('conferência das chaves do JWT na subida', () => {
  it('aceita o par gerado pelo openssl (PKCS#8 + SPKI), também com CRLF', () => {
    expect(conferirChaves(par.privadaPem, par.publicaPem, arquivos).publicaPem).toBe(par.publicaPem.trim());
    const crlf = (texto: string) => texto.replace(/\n/g, '\r\n');
    expect(() => conferirChaves(crlf(par.privadaPem), crlf(par.publicaPem), arquivos)).not.toThrow();
  });

  it('explica o BOM e o UTF-16 que o PowerShell grava', () => {
    expect(() => conferirChaves(`﻿${par.privadaPem}`, par.publicaPem, arquivos)).toThrow(/privada.*BOM.*gerar-chaves-jwt\.ps1/);
    // UTF-16LE lido como UTF-8: o BOM vira � e cada letra vem seguida de um \u0000
    const utf16 = Buffer.from(`﻿${par.publicaPem}`, 'utf16le').toString('utf8');
    expect(() => conferirChaves(par.privadaPem, utf16, arquivos)).toThrow(/pública.*UTF-16/);
  });

  it('explica a chave no formato PKCS#1 e o arquivo vazio', () => {
    expect(() => conferirChaves(par.privadaPkcs1, par.publicaPem, arquivos)).toThrow(/PKCS#1/);
    expect(() => conferirChaves(par.privadaPem, '', arquivos)).toThrow(/pública.*vazio/);
  });

  it('recusa uma pública que não é a da privada', () => {
    expect(() => conferirChaves(par.privadaPem, parRsa().publicaPem, arquivos)).toThrow(/não é a pública da chave privada/);
  });
});
