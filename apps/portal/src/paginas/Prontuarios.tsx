import { cpf, normalizar } from '@compartilhado/formatos';
import type { ProntuarioDaLista } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { useAtendimentos, useProntuarios } from '../api/consultas';
import { FiltroDeBusca } from '../componentes/Filtros';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { Etiqueta, NomeComAvatar, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

export function Prontuarios() {
  const prontuarios = useProntuarios();
  const atendimentos = useAtendimentos();
  const [busca, setBusca] = useState('');

  // Quantos atendimentos cada pessoa tem (a lista de atendimentos já traz a pessoa de cada um)
  const quantidade = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const a of atendimentos.data ?? []) contagem.set(a.pessoa.id, (contagem.get(a.pessoa.id) ?? 0) + 1);
    return contagem;
  }, [atendimentos.data]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return (prontuarios.data ?? [])
      .filter((p) => !termo || normalizar(p.pessoa.nome).includes(termo) || (p.pessoa.cpf ?? '').includes(termo))
      .sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
  }, [prontuarios.data, busca]);

  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtrados, 20, busca);

  const colunas: Coluna<ProntuarioDaLista>[] = [
    { titulo: 'Paciente', celula: (p) => <NomeComAvatar nome={p.pessoa.nome} detalhe={cpf(p.pessoa.cpf) ?? 'sem CPF'} /> },
    {
      titulo: 'Tipo sanguíneo',
      semQuebra: true,
      celula: (p) => <Valor vazio="—">{p.tipoSanguineo === 'DESCONHECIDO' ? 'Desconhecido' : p.tipoSanguineo}</Valor>,
    },
    {
      titulo: 'Alergias',
      celula: (p) => (p.alergias ? <Etiqueta cor="rose">{p.alergias}</Etiqueta> : <Valor vazio="nenhuma informada">{null}</Valor>),
    },
    {
      titulo: 'Atendimentos',
      semQuebra: true,
      celula: (p) => <Etiqueta cor="soft">{atendimentos.isPending ? '…' : (quantidade.get(p.pessoaId) ?? 0)}</Etiqueta>,
    },
  ];

  return (
    <Pagina
      titulo="Prontuários"
      descricao="Um prontuário por pessoa: o histórico clínico fixo (tipo sanguíneo, alergias, doenças, remédios)."
      aoAtualizar={() => {
        void prontuarios.refetch();
        void atendimentos.refetch();
      }}
      atualizando={prontuarios.isFetching || atendimentos.isFetching}
      atualizadoEm={prontuarios.dataUpdatedAt}
    >
      <Quadro
        barra={<FiltroDeBusca rotulo="Paciente" placeholder="Nome ou CPF" valor={busca} aoMudar={setBusca} className="sm:max-w-md" />}
        rodape={prontuarios.isSuccess && <Paginacao pagina={pagina} paginas={paginas} total={filtrados.length} aoMudar={setPagina} />}
      >
        <EstadoDaConsulta consulta={prontuarios}>
          {() => (
            <Tabela
              rotulo="Prontuários"
              itens={itensDaPagina}
              colunas={colunas}
              chave={(p) => p.id}
              link={(p) => `/prontuarios/${p.pessoaId}`}
              vazio="Nenhum prontuário encontrado."
              larguraMinima={800}
            />
          )}
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
