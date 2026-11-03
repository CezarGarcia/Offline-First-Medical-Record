import { RiFileList3Line, RiFirstAidKitLine } from '@remixicon/react';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';
import { Skeleton } from '@/components/base/skeleton/skeleton';
import { dataHora, diaEmBrasilia } from '@compartilhado/formatos';
import { DESFECHO, TIPO_OCORRENCIA, rotulo } from '@compartilhado/rotulos';
import type { Atendimento } from '@compartilhado/tipos';
import { useParams } from 'react-router';
import { eErroDaApi } from '../api/cliente';
import { useAtendimentosDaPessoa, useNomesDosProfissionais, useProntuarioDaPessoa } from '../api/consultas';
import { Secao } from '../componentes/Campos';
import { CartaoDoPaciente, SecaoOrigem, SecaoProntuario } from '../componentes/FichaDoAtendimento';
import { Aviso, AvisoDeErro, Carregando, EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { IdCurto, SeloModo, SeloTriagem } from '../componentes/Selos';
import { type Coluna, Tabela } from '../componentes/Tabela';

const COLUNAS: Coluna<Atendimento>[] = [
  { titulo: 'Ficha', celula: (a) => <IdCurto id={a.id} /> },
  { titulo: 'Data/hora', semQuebra: true, celula: (a) => <span className="tabular-nums">{dataHora(a.dataHora)}</span> },
  { titulo: 'Tipo', celula: (a) => rotulo(TIPO_OCORRENCIA, a.tipoOcorrencia) },
  { titulo: 'Queixa principal', celula: (a) => a.queixaPrincipal },
  { titulo: 'Triagem', semQuebra: true, celula: (a) => <SeloTriagem triagem={a.triagem} /> },
  { titulo: 'Desfecho', celula: (a) => rotulo(DESFECHO, a.desfecho.tipo) },
  { titulo: 'Profissional', celula: (a) => a.origem.criadoPorNome },
  { titulo: 'Modo', semQuebra: true, celula: (a) => <SeloModo modo={a.origem.modo} /> },
];

export function DetalheProntuario() {
  const { pessoaId = '' } = useParams();
  const prontuario = useProntuarioDaPessoa(pessoaId);
  const atendimentos = useAtendimentosDaPessoa(pessoaId);
  const nomes = useNomesDosProfissionais();
  const dados = prontuario.data;
  const semProntuario = eErroDaApi(prontuario.error, 'NAO_ENCONTRADO');
  const lista = [...(atendimentos.data ?? [])].sort((a, b) => b.dataHora.localeCompare(a.dataHora));

  return (
    <Pagina
      titulo={dados ? `Prontuário de ${dados.pessoa.nome}` : 'Prontuário'}
      descricao="Dados da pessoa, o prontuário e todos os atendimentos dela."
      aoAtualizar={() => {
        void prontuario.refetch();
        void atendimentos.refetch();
      }}
      atualizando={prontuario.isFetching || atendimentos.isFetching}
      atualizadoEm={prontuario.dataUpdatedAt}
      migalhas={
        <Breadcrumb aria-label="Caminho">
          <BreadcrumbItem href="/prontuarios" icon={RiFileList3Line}>
            Prontuários
          </BreadcrumbItem>
          <BreadcrumbItem current>{dados?.pessoa.nome ?? 'Prontuário'}</BreadcrumbItem>
        </Breadcrumb>
      }
    >
      {semProntuario ? (
        <Aviso titulo="Sem prontuário">Esta pessoa ainda não tem prontuário no servidor.</Aviso>
      ) : (
        <EstadoDaConsulta
          consulta={prontuario}
          carregando={
            <div role="status" aria-label="Carregando" className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <Skeleton className="h-[460px] rounded-3xl" />
              <Skeleton className="h-[300px] rounded-3xl" />
            </div>
          }
        >
          {() =>
            dados && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                <CartaoDoPaciente pessoa={dados.pessoa} referencia={diaEmBrasilia(new Date().toISOString())} prontuario={dados} />
                <div className="flex min-w-0 flex-col gap-4">
                  <SecaoProntuario prontuario={dados} />
                  <SecaoOrigem origem={dados.origem} sincronizacao={dados.sincronizacao} nomes={nomes} />
                </div>
              </div>
            )
          }
        </EstadoDaConsulta>
      )}

      <Secao
        titulo="Atendimentos"
        icone={RiFirstAidKitLine}
        acoes={
          atendimentos.isSuccess && (
            <span className="text-body-medium text-text-tertiary tabular-nums">
              {lista.length === 1 ? '1 atendimento' : `${lista.length} atendimentos`}
            </span>
          )
        }
      >
        {atendimentos.isError ? (
          <AvisoDeErro erro={atendimentos.error} />
        ) : (
          <>
            <p className="-mt-2 text-body-regular text-text-secondary">
              Clique num atendimento para ver a ficha completa, baixar o PDF ou enviar por e-mail.
            </p>
            <div className="overflow-hidden rounded-2xl border border-separator-border">
              {atendimentos.isPending ? (
                <Carregando linhas={3} />
              ) : (
                <Tabela
                  rotulo="Atendimentos da pessoa"
                  itens={lista}
                  colunas={COLUNAS}
                  chave={(a) => a.id}
                  link={(a) => `/atendimentos/${a.id}`}
                  vazio="Nenhum atendimento desta pessoa."
                  larguraMinima={900}
                />
              )}
            </div>
          </>
        )}
      </Secao>
    </Pagina>
  );
}
