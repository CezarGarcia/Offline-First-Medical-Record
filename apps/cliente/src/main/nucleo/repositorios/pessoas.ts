import { normalizar } from '@compartilhado/formatos';
import type { Pessoa, Sexo } from '@compartilhado/tipos';
import type { EstadoSync, PessoaLocal } from '../../../comum/contrato';
import type { BancoLocal } from '../banco';
import {
  COLUNAS_DA_ORIGEM,
  type LinhaComOrigem,
  estadoDaLinha,
  origemDaLinha,
  parametrosDaOrigem,
  sincronizacaoDaLinha,
  sqlDeInsert,
  sqlDeUpsert,
} from './comum';

interface Linha extends LinhaComOrigem {
  id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  telefone: string | null;
  email: string | null;
  contato_nome: string | null;
  contato_parentesco: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
}

const COLUNAS = [
  'id',
  'nome',
  'cpf',
  'data_nascimento',
  'sexo',
  'telefone',
  'email',
  'contato_nome',
  'contato_parentesco',
  'contato_telefone',
  'contato_email',
  ...COLUNAS_DA_ORIGEM,
];

function paraPessoa(l: Linha): PessoaLocal {
  const temContato = l.contato_nome || l.contato_parentesco || l.contato_telefone || l.contato_email;
  return {
    id: l.id,
    nome: l.nome,
    cpf: l.cpf,
    dataNascimento: l.data_nascimento,
    sexo: l.sexo as Sexo | null,
    telefone: l.telefone,
    email: l.email,
    contato: temContato
      ? { nome: l.contato_nome, parentesco: l.contato_parentesco, telefone: l.contato_telefone, email: l.contato_email }
      : null,
    origem: origemDaLinha(l),
    sincronizacao: sincronizacaoDaLinha(l),
    estadoSync: estadoDaLinha(l),
  };
}

function parametros(p: Omit<PessoaLocal, 'estadoSync'>, estado: EstadoSync) {
  return {
    id: p.id,
    nome: p.nome,
    cpf: p.cpf,
    data_nascimento: p.dataNascimento,
    sexo: p.sexo,
    telefone: p.telefone,
    email: p.email,
    contato_nome: p.contato?.nome ?? null,
    contato_parentesco: p.contato?.parentesco ?? null,
    contato_telefone: p.contato?.telefone ?? null,
    contato_email: p.contato?.email ?? null,
    ...parametrosDaOrigem(p.origem, p.sincronizacao, estado),
  };
}

const INSERT = sqlDeInsert('pessoa', COLUNAS);
const UPSERT = sqlDeUpsert('pessoa', COLUNAS);

export class RepositorioPessoas {
  constructor(private readonly banco: BancoLocal) {}

  /** Cadastro feito neste aparelho: entra como PENDENTE, até o servidor confirmar. */
  inserirLocal(pessoa: Omit<PessoaLocal, 'estadoSync' | 'sincronizacao'>): void {
    this.banco.executar(INSERT, parametros({ ...pessoa, sincronizacao: null }, 'PENDENTE'));
  }

  /** Veio do servidor (resposta de um envio ou "receber dados"): a versão do servidor substitui a local. */
  gravarDoServidor(pessoa: Pessoa): void {
    this.banco.executar(UPSERT, parametros(pessoa, 'SINCRONIZADO'));
  }

  marcar(id: string, estado: EstadoSync): void {
    this.banco.executar('UPDATE pessoa SET estado_sync = :estado WHERE id = :id', { id, estado });
  }

  buscar(id: string): PessoaLocal | null {
    const linha = this.banco.um<Linha>('SELECT * FROM pessoa WHERE id = :id', { id });
    return linha ? paraPessoa(linha) : null;
  }

  comCpf(cpf: string): PessoaLocal | null {
    const linha = this.banco.um<Linha>('SELECT * FROM pessoa WHERE cpf = :cpf ORDER BY criado_em LIMIT 1', { cpf });
    return linha ? paraPessoa(linha) : null;
  }

  /** Busca por nome (sem acento, sem diferença de maiúsculas) ou por CPF. */
  buscarPorTermo(termo: string): PessoaLocal[] {
    const todas = this.banco.todos<Linha>('SELECT * FROM pessoa ORDER BY nome COLLATE NOCASE').map(paraPessoa);
    const busca = normalizar(termo);
    const digitos = termo.replace(/\D/g, '');
    if (!busca) return todas;
    return todas.filter((p) => normalizar(p.nome).includes(busca) || (digitos.length >= 3 && (p.cpf ?? '').includes(digitos)));
  }

  /**
   * Unificação (docs/07, seção 7.6): os prontuários da pessoa descartada passam para a mantida, e a descartada
   * sai do aparelho. Os itens da fila que ainda apontam para ela não mudam: o servidor traduz o ID.
   */
  unificar(idDescartado: string, idMantido: string): void {
    if (idDescartado === idMantido) return;
    this.banco.executar('UPDATE prontuario SET pessoa_id = :mantido WHERE pessoa_id = :descartado', {
      mantido: idMantido,
      descartado: idDescartado,
    });
    this.banco.executar('DELETE FROM pessoa WHERE id = :id', { id: idDescartado });
  }
}
