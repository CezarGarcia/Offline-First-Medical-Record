import { Alert, Anchor, Breadcrumbs, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { dataHora, diaEmBrasilia } from '@compartilhado/formatos';
import { DESFECHO, TIPO_OCORRENCIA, rotulo } from '@compartilhado/rotulos';
import type { Atendimento } from '@compartilhado/tipos';
import { Link, useNavigate, useParams } from 'react-router';
import { eErroDaApi } from '../api/cliente';
import { useAtendimentosDaPessoa, useNomesDosProfissionais, useProntuarioDaPessoa } from '../api/consultas';
import { Secao } from '../componentes/Campos';
import { SecaoOrigem, SecaoPaciente, SecaoProntuario } from '../componentes/FichaDoAtendimento';
import { AvisoDeErro, EstadoDaConsulta, Pagina } from '../componentes/Pagina';
import { IdCurto, SeloModo, SeloTriagem } from '../componentes/Selos';
import { type Coluna, Tabela } from '../componentes/Tabela';

const COLUNAS: Coluna<Atendimento>[] = [
  { titulo: 'Ficha', celula: (a) => <IdCurto id={a.id} /> },
  { titulo: 'Data/hora', celula: (a) => dataHora(a.dataHora) },
  { titulo: 'Tipo', celula: (a) => rotulo(TIPO_OCORRENCIA, a.tipoOcorrencia) },
  { titulo: 'Queixa principal', celula: (a) => a.queixaPrincipal },
  { titulo: 'Triagem', celula: (a) => <SeloTriagem triagem={a.triagem} /> },
  { titulo: 'Desfecho', celula: (a) => rotulo(DESFECHO, a.desfecho.tipo) },
  { titulo: 'Profissional', celula: (a) => a.origem.criadoPorNome },
  { titulo: 'Modo', celula: (a) => <SeloModo modo={a.origem.modo} /> },
];

export function DetalheProntuario() {
  const { pessoaId = '' } = useParams();
  const prontuario = useProntuarioDaPessoa(pessoaId);
  const atendimentos = useAtendimentosDaPessoa(pessoaId);
  const nomes = useNomesDosProfissionais();
  const navegar = useNavigate();
  const dados = prontuario.data;
  const semProntuario = eErroDaApi(prontuario.error, 'NAO_ENCONTRADO');

  return (
    <Pagina
      titulo={dados ? `Prontuário de ${dados.pessoa.nome}` : 'Prontuário'}
      descricao="Dados da pessoa, o prontuário e todos os atendimentos dela."
      aoAtualizar={() => {
        void prontuario.refetch();
        void atendimentos.refetch();
      }}
      atualizando={prontuario.isFetching || atendimentos.isFetching}
    >
      <Breadcrumbs>
        <Anchor component={Link} to="/prontuarios" size="sm">
          Prontuários
        </Anchor>
        <Anchor size="sm" c="dimmed" underline="never">
          {dados?.pessoa.nome ?? 'Prontuário'}
        </Anchor>
      </Breadcrumbs>

      {semProntuario ? (
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />} title="Sem prontuário">
          Esta pessoa ainda não tem prontuário no servidor.
        </Alert>
      ) : (
        <EstadoDaConsulta consulta={prontuario}>
          {() =>
            dados && (
              <Stack gap="md">
                <SecaoPaciente pessoa={dados.pessoa} referencia={diaEmBrasilia(new Date().toISOString())} />
                <SecaoProntuario prontuario={dados} />
                <SecaoOrigem origem={dados.origem} sincronizacao={dados.sincronizacao} nomes={nomes} />
              </Stack>
            )
          }
        </EstadoDaConsulta>
      )}

      <Secao titulo="Atendimentos">
        {atendimentos.isError ? (
          <AvisoDeErro erro={atendimentos.error} />
        ) : (
          <>
            <Text size="sm" c="dimmed">
              Clique num atendimento para ver a ficha completa, baixar o PDF ou enviar por e-mail.
            </Text>
            <Tabela
              itens={[...(atendimentos.data ?? [])].sort((a, b) => b.dataHora.localeCompare(a.dataHora))}
              colunas={COLUNAS}
              chave={(a) => a.id}
              aoClicar={(a) => navegar(`/atendimentos/${a.id}`)}
              vazio={atendimentos.isPending ? 'Carregando…' : 'Nenhum atendimento desta pessoa.'}
              larguraMinima={900}
            />
          </>
        )}
      </Secao>
    </Pagina>
  );
}
