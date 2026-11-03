import { RiCapsuleLine } from '@remixicon/react';
import { dataHora, normalizar } from '@compartilhado/formatos';
import { UNIDADE, rotulo } from '@compartilhado/rotulos';
import type { Medicamento } from '@compartilhado/tipos';
import { useMemo, useState } from 'react';
import { useMedicamentos } from '../api/consultas';
import { FiltroDeBusca } from '../componentes/Filtros';
import { EstadoDaConsulta, Pagina, Quadro } from '../componentes/Pagina';
import { Etiqueta, SeloSimNao, Valor } from '../componentes/Selos';
import { type Coluna, Paginacao, Tabela, usePaginacao } from '../componentes/Tabela';

const COLUNAS: Coluna<Medicamento>[] = [
  {
    titulo: 'Nome',
    celula: (m) => (
      <span className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-2lg bg-background-tertiary-default">
          <RiCapsuleLine className="size-4 text-foreground-icon-secondary" aria-hidden />
        </span>
        <span className="text-body-semibold text-text-primary">{m.nome}</span>
      </span>
    ),
  },
  { titulo: 'Apresentação', celula: (m) => <Valor vazio="—">{m.apresentacao}</Valor> },
  { titulo: 'Unidade padrão', semQuebra: true, celula: (m) => <Etiqueta cor="soft">{rotulo(UNIDADE, m.unidadePadrao)}</Etiqueta> },
  { titulo: 'Situação', semQuebra: true, celula: (m) => <SeloSimNao valor={m.ativo} /> },
  { titulo: 'Atualizado em', semQuebra: true, celula: (m) => <span className="tabular-nums">{dataHora(m.atualizadoEm)}</span> },
];

export function Medicamentos() {
  const consulta = useMedicamentos();
  const [busca, setBusca] = useState('');
  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return (consulta.data ?? []).filter((m) => !termo || normalizar(`${m.nome} ${m.apresentacao ?? ''}`).includes(termo));
  }, [consulta.data, busca]);
  const { pagina, paginas, setPagina, itensDaPagina } = usePaginacao(filtrados, 25, busca);

  return (
    <Pagina
      titulo="Medicamentos"
      descricao="Catálogo usado nas fichas. É um cadastro de apoio: novos medicamentos entram direto no banco (passo 9 do roteiro) e aparecem aqui ao atualizar."
      aoAtualizar={() => consulta.refetch()}
      atualizando={consulta.isFetching}
      atualizadoEm={consulta.dataUpdatedAt}
    >
      <Quadro
        barra={
          <FiltroDeBusca rotulo="Buscar" placeholder="Nome ou apresentação" valor={busca} aoMudar={setBusca} className="sm:max-w-md" />
        }
        rodape={consulta.isSuccess && <Paginacao pagina={pagina} paginas={paginas} total={filtrados.length} aoMudar={setPagina} />}
      >
        <EstadoDaConsulta consulta={consulta}>
          {() => (
            <Tabela
              rotulo="Medicamentos"
              itens={itensDaPagina}
              colunas={COLUNAS}
              chave={(m) => m.id}
              vazio="Nenhum medicamento encontrado."
              larguraMinima={700}
            />
          )}
        </EstadoDaConsulta>
      </Quadro>
    </Pagina>
  );
}
