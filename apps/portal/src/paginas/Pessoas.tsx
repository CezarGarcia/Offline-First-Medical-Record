import { cpf, data, normalizar, telefone } from '@compartilhado/formatos';
import { SEXO, rotulo } from '@compartilhado/rotulos';
import type { Pessoa } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { usePessoas } from '../api/consultas';
import { FiltroDeBusca } from '../componentes/Filtros';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { NomeComAvatar, SeloModo, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

const COLUNAS: Coluna<Pessoa>[] = [
  { titulo: 'Nome', celula: (p) => <NomeComAvatar nome={p.nome} detalhe={rotulo(SEXO, p.sexo)} /> },
  { titulo: 'CPF', semQuebra: true, celula: (p) => <Valor vazio="—">{cpf(p.cpf)}</Valor> },
  { titulo: 'Nascimento', semQuebra: true, celula: (p) => <Valor vazio="—">{data(p.dataNascimento)}</Valor> },
  {
    titulo: 'Contatos',
    celula: (p) => (
      <div className="flex flex-col">
        <span>{[telefone(p.telefone), p.email].filter(Boolean).join(' · ') || '—'}</span>
        {p.contato?.nome && (
          <span className="text-caption-1-regular text-text-tertiary">
            Familiar: {p.contato.nome}
            {p.contato.parentesco ? ` (${p.contato.parentesco})` : ''}
            {p.contato.telefone ? ` · ${telefone(p.contato.telefone)}` : ''}
            {p.contato.email ? ` · ${p.contato.email}` : ''}
          </span>
        )}
      </div>
    ),
  },
  {
    titulo: 'Origem',
    celula: (p) => (
      <div className="flex flex-col items-start gap-1">
        <span>{p.origem.criadoPorNome}</span>
        <span className="flex items-center gap-1.5 text-caption-1-regular text-text-tertiary">
          {p.origem.dispositivoNome ?? 'sem dispositivo'} <SeloModo modo={p.origem.modo} />
        </span>
      </div>
    ),
  },
];

export function Pessoas() {
  const consulta = usePessoas();
  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    return (consulta.data ?? []).filter((p) => !termo || normalizar(p.nome).includes(termo) || (p.cpf ?? '').includes(termo));
  }, [consulta.data, busca]);
  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtradas, 20, busca);

  return (
    <Pagina
      titulo="Pessoas"
      descricao="Pacientes cadastrados (pelos aparelhos ou direto no banco). Clique para ver o prontuário."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <Quadro
        barra={<FiltroDeBusca rotulo="Buscar" placeholder="Nome ou CPF" valor={busca} aoMudar={setBusca} className="sm:max-w-md" />}
        rodape={consulta.isSuccess && <Paginacao pagina={pagina} paginas={paginas} total={filtradas.length} aoMudar={setPagina} />}
      >
        <EstadoDaConsulta consulta={consulta}>
          {() => (
            <Tabela
              rotulo="Pessoas"
              itens={itensDaPagina}
              colunas={COLUNAS}
              chave={(p) => p.id}
              link={(p) => `/prontuarios/${p.id}`}
              vazio="Nenhuma pessoa encontrada."
              larguraMinima={1000}
            />
          )}
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
