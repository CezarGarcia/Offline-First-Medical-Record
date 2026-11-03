import type { Origem, Sincronizacao } from '@compartilhado/tipos';
import type { EstadoSync } from '../../../comum/contrato';

/** As colunas de rastreabilidade, iguais nas tabelas pessoa, prontuario e atendimento. */
export interface LinhaComOrigem {
  criado_por_id: string;
  criado_por_nome: string;
  criado_por_registro: string;
  criado_em: string;
  dispositivo_id: string | null;
  dispositivo_nome: string | null;
  modo_registro: string;
  sincronizado_por_id: string | null;
  recebido_em: string | null;
  atualizado_em: string | null;
  estado_sync: string;
}

export function origemDaLinha(linha: LinhaComOrigem): Origem {
  return {
    criadoPorId: linha.criado_por_id,
    criadoPorNome: linha.criado_por_nome,
    criadoPorRegistro: linha.criado_por_registro,
    criadoEm: linha.criado_em,
    dispositivoId: linha.dispositivo_id,
    dispositivoNome: linha.dispositivo_nome,
    modo: linha.modo_registro === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
  };
}

export function sincronizacaoDaLinha(linha: LinhaComOrigem): Sincronizacao | null {
  if (!linha.recebido_em) return null;
  return {
    sincronizadoPorId: linha.sincronizado_por_id ?? '',
    recebidoEm: linha.recebido_em,
    atualizadoEm: linha.atualizado_em ?? linha.recebido_em,
  };
}

export function estadoDaLinha(linha: LinhaComOrigem): EstadoSync {
  return linha.estado_sync === 'SINCRONIZADO' || linha.estado_sync === 'ERRO' ? linha.estado_sync : 'PENDENTE';
}

/** Parâmetros das colunas de rastreabilidade, para INSERT e UPDATE. */
export function parametrosDaOrigem(
  origem: Origem,
  sincronizacao: Sincronizacao | null,
  estado: EstadoSync,
): Record<string, string | null> {
  return {
    criado_por_id: origem.criadoPorId,
    criado_por_nome: origem.criadoPorNome,
    criado_por_registro: origem.criadoPorRegistro,
    criado_em: origem.criadoEm,
    dispositivo_id: origem.dispositivoId,
    dispositivo_nome: origem.dispositivoNome,
    modo_registro: origem.modo,
    sincronizado_por_id: sincronizacao?.sincronizadoPorId ?? null,
    recebido_em: sincronizacao?.recebidoEm ?? null,
    atualizado_em: sincronizacao?.atualizadoEm ?? null,
    estado_sync: estado,
  };
}

export const COLUNAS_DA_ORIGEM = [
  'criado_por_id',
  'criado_por_nome',
  'criado_por_registro',
  'criado_em',
  'dispositivo_id',
  'dispositivo_nome',
  'modo_registro',
  'sincronizado_por_id',
  'recebido_em',
  'atualizado_em',
  'estado_sync',
];

/** "INSERT ... ON CONFLICT(id) DO UPDATE" com todas as colunas: o que vem do servidor substitui a cópia local. */
export function sqlDeUpsert(tabela: string, colunas: string[]): string {
  const valores = colunas.map((c) => `:${c}`).join(', ');
  const atualizacoes = colunas
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  return `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${valores}) ON CONFLICT (id) DO UPDATE SET ${atualizacoes}`;
}

export function sqlDeInsert(tabela: string, colunas: string[]): string {
  return `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map((c) => `:${c}`).join(', ')})`;
}
