/**
 * Os itens da fila (outbox) são comandos (padrão **Command**): cada tipo sabe montar a própria requisição e
 * aplicar a resposta no banco local. O motor de sincronização executa todos do mesmo jeito, na ordem.
 */
import { numeroDaFicha } from '@compartilhado/formatos';
import type { Atendimento, EnvioEmail, Pessoa, Prontuario, ResultadoDoCadastro } from '@compartilhado/tipos';
import type { TipoItemDaFila } from '../../comum/contrato';
import type { Auditoria } from './auditoria';
import type { RespostaHttp } from './http';
import type { RepositorioAtendimentos } from './repositorios/atendimentos';
import type { LinhaDaFila } from './repositorios/outbox';
import type { RepositorioPessoas } from './repositorios/pessoas';
import type { RepositorioProntuarios } from './repositorios/prontuarios';

export interface ContextoDosComandos {
  pessoas: RepositorioPessoas;
  prontuarios: RepositorioProntuarios;
  atendimentos: RepositorioAtendimentos;
  auditoria: Auditoria;
}

export interface Requisicao {
  rota: string;
  corpo: unknown;
}

export interface Comando {
  readonly item: LinhaDaFila;
  requisicao(): Requisicao;
  /** Deu certo (2xx): aplica a resposta no banco local. Devolve o que fica guardado no item (ou null). */
  aplicar(resposta: RespostaHttp, contexto: ContextoDosComandos): unknown;
  /** Erro definitivo: o registro local fica marcado com erro. */
  aoFalhar(contexto: ContextoDosComandos): void;
  descrever(contexto: ContextoDosComandos): string;
}

abstract class ComandoBase<TPayload> implements Comando {
  constructor(readonly item: LinhaDaFila) {}

  protected get payload(): TPayload {
    return JSON.parse(this.item.payload) as TPayload;
  }

  abstract requisicao(): Requisicao;
  abstract aplicar(resposta: RespostaHttp, contexto: ContextoDosComandos): unknown;
  abstract descrever(contexto: ContextoDosComandos): string;

  aoFalhar(_contexto: ContextoDosComandos): void {}
}

class CriarPessoa extends ComandoBase<{ nome: string }> {
  requisicao(): Requisicao {
    return { rota: '/pessoa', corpo: this.payload };
  }

  aplicar(resposta: RespostaHttp, { pessoas, auditoria }: ContextoDosComandos): unknown {
    const resultado = resposta.corpo as ResultadoDoCadastro<Pessoa>;
    pessoas.gravarDoServidor(resultado.dados);
    if (resultado.resultado === 'UNIFICADO') {
      pessoas.unificar(resultado.idEnviado, resultado.id);
      auditoria.registrar('REGISTRO_UNIFICADO', {
        entidade: 'PESSOA',
        idDescartado: resultado.idEnviado,
        idMantido: resultado.id,
        conflitoId: resultado.conflitoId,
      });
    }
    return { resultado: resultado.resultado, id: resultado.id };
  }

  aoFalhar({ pessoas }: ContextoDosComandos): void {
    pessoas.marcar(this.item.entidade_id, 'ERRO');
  }

  descrever(): string {
    return `Pessoa: ${this.payload.nome}`;
  }
}

class CriarProntuario extends ComandoBase<{ pessoaId: string }> {
  requisicao(): Requisicao {
    return { rota: '/prontuario', corpo: this.payload };
  }

  aplicar(resposta: RespostaHttp, { prontuarios, auditoria }: ContextoDosComandos): unknown {
    const resultado = resposta.corpo as ResultadoDoCadastro<Prontuario>;
    prontuarios.gravarDoServidor(resultado.dados);
    if (resultado.resultado === 'UNIFICADO') {
      prontuarios.unificar(resultado.idEnviado, resultado.id);
      auditoria.registrar('REGISTRO_UNIFICADO', {
        entidade: 'PRONTUARIO',
        idDescartado: resultado.idEnviado,
        idMantido: resultado.id,
        conflitoId: resultado.conflitoId,
      });
    }
    return { resultado: resultado.resultado, id: resultado.id };
  }

  aoFalhar({ prontuarios }: ContextoDosComandos): void {
    prontuarios.marcar(this.item.entidade_id, 'ERRO');
  }

  descrever({ pessoas }: ContextoDosComandos): string {
    const pessoa = pessoas.buscar(this.payload.pessoaId);
    return pessoa ? `Prontuário de ${pessoa.nome}` : 'Prontuário';
  }
}

class CriarAtendimento extends ComandoBase<{ prontuarioId: string; dataHora: string }> {
  requisicao(): Requisicao {
    return { rota: '/atendimento', corpo: this.payload };
  }

  aplicar(resposta: RespostaHttp, { atendimentos }: ContextoDosComandos): unknown {
    const resultado = resposta.corpo as ResultadoDoCadastro<Atendimento>;
    atendimentos.gravarDoServidor(resultado.dados);
    return { resultado: resultado.resultado, id: resultado.id };
  }

  aoFalhar({ atendimentos }: ContextoDosComandos): void {
    atendimentos.marcar(this.item.entidade_id, 'ERRO');
  }

  descrever({ prontuarios, pessoas }: ContextoDosComandos): string {
    const prontuario = prontuarios.buscar(this.payload.prontuarioId);
    const pessoa = prontuario ? pessoas.buscar(prontuario.pessoaId) : null;
    return `Atendimento Nº ${numeroDaFicha(this.item.entidade_id)}${pessoa ? ` de ${pessoa.nome}` : ''}`;
  }
}

interface PayloadDoEmail {
  atendimentoId: string;
  id: string;
  destinatario: { tipo: string; email?: string | null };
}

class EnviarEmail extends ComandoBase<PayloadDoEmail> {
  requisicao(): Requisicao {
    const { atendimentoId, id, destinatario } = this.payload;
    return { rota: `/documentos/ficha/${atendimentoId}/email`, corpo: { id, destinatario } };
  }

  aplicar(resposta: RespostaHttp): unknown {
    return resposta.corpo as EnvioEmail;
  }

  descrever(): string {
    const { atendimentoId, destinatario } = this.payload;
    const para = destinatario.tipo === 'OUTRO' ? destinatario.email : destinatario.tipo === 'PACIENTE' ? 'o paciente' : 'o familiar';
    return `E-mail da ficha Nº ${numeroDaFicha(atendimentoId)} para ${para}`;
  }
}

const COMANDOS: Record<TipoItemDaFila, new (item: LinhaDaFila) => Comando> = {
  CRIAR_PESSOA: CriarPessoa,
  CRIAR_PRONTUARIO: CriarProntuario,
  CRIAR_ATENDIMENTO: CriarAtendimento,
  ENVIAR_EMAIL: EnviarEmail,
};

export function comandoPara(item: LinhaDaFila): Comando {
  const Classe = COMANDOS[item.tipo];
  if (!Classe) throw new Error(`Tipo de item da fila desconhecido: ${item.tipo}`);
  return new Classe(item);
}
