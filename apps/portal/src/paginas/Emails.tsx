import { RiCheckboxCircleFill, RiErrorWarningFill, RiSearchLine } from '@remixicon/react';
import { dataHora, numeroDaFicha } from '@compartilhado/formatos';
import { eUuid } from '@compartilhado/ids';
import { DESTINATARIO, rotulo } from '@compartilhado/rotulos';
import type { EnvioEmail } from '@compartilhado/tipos';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Chip } from '@/components/base/badges/chip';
import { Input } from '@/components/base/input/input';
import { useEnviosDeEmail, useNomesDosProfissionais } from '../api/consultas';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { IdCurto, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela } from '../componentes/Tabela';

const TAMANHO_DA_PAGINA = 50;

export function Emails() {
  const nomes = useNomesDosProfissionais();
  const [parametros, setParametros] = useSearchParams();
  const [atendimento, setAtendimento] = useState(parametros.get('atendimentoId') ?? '');
  const [pagina, setPagina] = useState(1);
  const atendimentoValido = !atendimento.trim() || eUuid(atendimento);
  const atendimentoId = atendimento.trim() && eUuid(atendimento) ? atendimento.trim() : null;
  const consulta = useEnviosDeEmail({ atendimentoId, pagina, tamanho: TAMANHO_DA_PAGINA });

  useEffect(() => {
    setPagina(1);
    setParametros(atendimentoId ? { atendimentoId } : {}, { replace: true });
  }, [atendimentoId, setParametros]);

  const colunas: Coluna<EnvioEmail>[] = [
    { titulo: 'Pedido em', semQuebra: true, celula: (e) => <span className="tabular-nums">{dataHora(e.solicitadoEm)}</span> },
    {
      titulo: 'Atendimento',
      semQuebra: true,
      celula: (e) => (
        <Link
          to={`/atendimentos/${e.atendimentoId}`}
          className="rounded-md text-body-medium text-accent-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Ficha Nº {numeroDaFicha(e.atendimentoId)}
        </Link>
      ),
    },
    {
      titulo: 'Destinatário',
      celula: (e) => (
        <div className="flex flex-col">
          <span>{e.destinatarioEmail}</span>
          <span className="text-caption-1-regular text-text-tertiary">{rotulo(DESTINATARIO, e.destinatarioTipo)}</span>
        </div>
      ),
    },
    {
      titulo: 'Status',
      semQuebra: true,
      celula: (e) => {
        const enviado = e.status === 'ENVIADO';
        const Icone = enviado ? RiCheckboxCircleFill : RiErrorWarningFill;
        return (
          <Chip variant="caption" color={enviado ? 'lime' : 'rose'} className="gap-1">
            <Icone className="size-3.5" aria-hidden />
            {enviado ? 'Enviado' : 'Erro'}
          </Chip>
        );
      },
    },
    { titulo: 'Tentativas', semQuebra: true, celula: (e) => <span className="tabular-nums">{e.tentativas}</span> },
    {
      titulo: 'Erro',
      celula: (e) => (e.erro ? <span className="text-text-error-primary">{e.erro}</span> : <Valor vazio="—">{null}</Valor>),
    },
    { titulo: 'Quem pediu', celula: (e) => nomes.get(e.solicitadoPorId) ?? e.solicitadoPorId },
    { titulo: 'Enviado em', semQuebra: true, celula: (e) => <Valor vazio="—">{dataHora(e.enviadoEm)}</Valor> },
    { titulo: 'Pedido', celula: (e) => <IdCurto id={e.id} /> },
  ];

  const dados = consulta.data;
  return (
    <Pagina
      titulo="E-mails enviados"
      descricao="Cada pedido de envio da ficha por e-mail, com o resultado. O mesmo pedido nunca manda dois e-mails; um pedido com erro pode ser repetido pelo cliente."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <Quadro
        barra={
          <Input
            label="ID do atendimento"
            placeholder="Todos os atendimentos (cole o UUID para filtrar)"
            leadingIcon={RiSearchLine}
            value={atendimento}
            onChange={setAtendimento}
            isInvalid={!atendimentoValido}
            errorMessage="Cole o ID completo do atendimento (UUID)"
            className="sm:max-w-xl"
          />
        }
        rodape={
          dados && (
            <Paginacao
              pagina={dados.pagina}
              paginas={Math.max(1, Math.ceil(dados.total / dados.tamanho))}
              total={dados.total}
              aoMudar={setPagina}
            />
          )
        }
      >
        <EstadoDaConsulta consulta={consulta}>
          {() =>
            dados && (
              <Tabela
                rotulo="E-mails enviados"
                itens={dados.itens}
                colunas={colunas}
                chave={(e) => e.id}
                vazio="Nenhum e-mail enviado ainda."
                larguraMinima={1200}
              />
            )
          }
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
