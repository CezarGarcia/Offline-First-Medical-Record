import { readFile } from 'node:fs/promises';
import { COMO_GERAR_CHAVES, conferirChaves } from './seguranca/chaves.js';

export const SERVICO = 'ms-auth';
export const EMISSOR_TOKEN = 'medicalfield-auth';
export const PUBLICO_TOKEN = 'medicalfield';
export const VALIDADE_TOKEN_ACESSO_MIN = 15;
export const VALIDADE_SESSAO_DIAS = 7;
export const MAX_TENTATIVAS_LOGIN = 5;
export const BLOQUEIO_MINUTOS = 5;

export interface ConfigBanco {
  host: string;
  porta: number;
  nome: string;
  usuario: string;
  senha: string;
}

export interface Config {
  porta: number;
  banco: ConfigBanco;
  chavePrivadaPem: string;
  chavePublicaPem: string;
}

function obrigatoria(env: NodeJS.ProcessEnv, nome: string): string {
  const valor = env[nome];
  if (!valor) throw new Error(`A variável de ambiente ${nome} não foi definida.`);
  return valor;
}

export function configBanco(env: NodeJS.ProcessEnv = process.env): ConfigBanco {
  return {
    host: env.DB_HOST ?? 'localhost',
    porta: Number(env.DB_PORTA ?? 5432),
    nome: env.DB_NOME ?? 'medicalfield',
    usuario: env.DB_USUARIO ?? 'ms_auth',
    senha: obrigatoria(env, 'DB_SENHA'),
  };
}

async function lerChave(caminho: string, qual: string): Promise<string> {
  try {
    return await readFile(caminho, 'utf8');
  } catch (erro) {
    // O Docker Desktop (Windows) cria uma PASTA no lugar da chave quando o arquivo não existe na máquina
    const motivo =
      (erro as NodeJS.ErrnoException).code === 'EISDIR'
        ? 'é uma pasta, não um arquivo: as chaves não tinham sido geradas quando o container subiu'
        : 'o arquivo não existe ou não pode ser lido: as chaves não foram geradas';
    throw new Error(`Não foi possível ler a chave ${qual} do JWT em ${caminho} (${motivo}). ${COMO_GERAR_CHAVES}`);
  }
}

export async function carregarConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const arquivos = {
    privada: env.JWT_CHAVE_PRIVADA_ARQUIVO ?? '/run/secrets/jwt-privada.pem',
    publica: env.JWT_CHAVE_PUBLICA_ARQUIVO ?? '/run/secrets/jwt-publica.pem',
  };
  const chaves = conferirChaves(
    await lerChave(arquivos.privada, 'privada'),
    await lerChave(arquivos.publica, 'pública'),
    arquivos,
  );
  return {
    porta: Number(env.PORTA ?? 3000),
    banco: configBanco(env),
    chavePrivadaPem: chaves.privadaPem,
    chavePublicaPem: chaves.publicaPem,
  };
}
