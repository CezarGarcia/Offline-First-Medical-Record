import { Button, Group, SegmentedControl, TextInput } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { normalizar, numeroDaFicha } from '@compartilhado/formatos';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { EstadoSync } from '../../../comum/contrato';
import { AvisoDeErro, Carregando, Pagina } from '../componentes/Basicos';
import { ListaDeAtendimentos } from '../componentes/ListaDeAtendimentos';
import { nucleo } from '../nucleo';

type Filtro = 'TODOS' | EstadoSync;

export function Atendimentos() {
  const [termo, setTermo] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const atendimentos = useQuery({ queryKey: ['atendimentos'], queryFn: () => nucleo.atendimentos() });

  const itens = useMemo(() => {
    const busca = normalizar(termo);
    return (atendimentos.data ?? []).filter(
      (a) =>
        (filtro === 'TODOS' || a.estadoSync === filtro) &&
        (!busca || normalizar(a.pessoa.nome).includes(busca) || numeroDaFicha(a.id).toLowerCase().includes(busca)),
    );
  }, [atendimentos.data, termo, filtro]);

  return (
    <Pagina
      titulo="Atendimentos"
      descricao="Os deste aparelho e os recebidos do servidor, do mais recente para o mais antigo."
      acoes={
        <Button component={Link} to="/nova-ocorrencia" leftSection={<IconPlus size={16} />}>
          Nova ocorrência
        </Button>
      }
    >
      <Group>
        <TextInput
          style={{ flex: 1, maxWidth: 420 }}
          placeholder="Buscar por paciente ou número da ficha"
          aria-label="Buscar por paciente ou número da ficha"
          leftSection={<IconSearch size={16} />}
          value={termo}
          onChange={(e) => setTermo(e.currentTarget.value)}
        />
        <SegmentedControl
          aria-label="Filtrar pela sincronização"
          value={filtro}
          onChange={(valor) => setFiltro(valor as Filtro)}
          data={[
            { value: 'TODOS', label: 'Todos' },
            { value: 'PENDENTE', label: 'Pendentes' },
            { value: 'SINCRONIZADO', label: 'Sincronizados' },
            { value: 'ERRO', label: 'Com erro' },
          ]}
        />
      </Group>
      {atendimentos.isLoading ? (
        <Carregando />
      ) : atendimentos.isError ? (
        <AvisoDeErro erro={atendimentos.error} />
      ) : (
        <ListaDeAtendimentos
          itens={itens}
          filtro={[termo, filtro]}
          vazio={termo || filtro !== 'TODOS' ? 'Nenhum atendimento com esse filtro.' : 'Nenhum atendimento neste aparelho ainda.'}
        />
      )}
    </Pagina>
  );
}
