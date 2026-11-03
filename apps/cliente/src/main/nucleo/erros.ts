import type { ProblemaDeCampo } from '@compartilhado/validacao';
import type { ErroSerializado } from '../../comum/contrato';

/** Erro de regra do núcleo, mostrado na tela como veio (mensagem em português, código para a tela decidir). */
export class ErroDoNucleo extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly detalhes: ProblemaDeCampo[] = [],
    readonly extras: { bloqueadoAte?: string } = {},
  ) {
    super(mensagem);
    this.name = 'ErroDoNucleo';
  }

  static validacao(detalhes: ProblemaDeCampo[]): ErroDoNucleo {
    return new ErroDoNucleo('VALIDACAO', 'Há campos inválidos.', detalhes);
  }

  static semSessao(): ErroDoNucleo {
    return new ErroDoNucleo('SEM_SESSAO', 'Entre com o seu registro para continuar.');
  }

  serializar(): ErroSerializado {
    return {
      codigo: this.codigo,
      mensagem: this.message,
      ...(this.detalhes.length ? { detalhes: this.detalhes } : {}),
      ...(this.extras.bloqueadoAte ? { bloqueadoAte: this.extras.bloqueadoAte } : {}),
    };
  }
}

export function serializarErro(erro: unknown): ErroSerializado {
  if (erro instanceof ErroDoNucleo) return erro.serializar();
  console.error('[nucleo] erro inesperado', erro);
  return { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado no aplicativo. Tente de novo.' };
}
