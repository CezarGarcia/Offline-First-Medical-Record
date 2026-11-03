import { Alert, Button, Group, Select, SimpleGrid, Stack, Textarea } from '@mantine/core';
import type { TipoSanguineo } from '@compartilhado/tipos';
import { type DadosProntuario, TIPOS_SANGUINEOS, validarProntuario } from '@compartilhado/validacao';
import { type FormEvent, useState } from 'react';
import type { ProntuarioLocal } from '../../../comum/contrato';
import { errosPorCampo, mensagemDoErro, nucleo } from '../nucleo';

export function FormProntuario({ pessoaId, aoSalvar }: { pessoaId: string; aoSalvar: (prontuario: ProntuarioLocal) => void }) {
  const [dados, setDados] = useState<DadosProntuario>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudar = (campo: keyof DadosProntuario, valor: unknown) => {
    setDados((d) => ({ ...d, [campo]: valor }));
    setErros((atuais) => (campo in atuais ? Object.fromEntries(Object.entries(atuais).filter(([c]) => c !== campo)) : atuais));
  };

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    const problemas = validarProntuario(dados);
    setErros(Object.fromEntries(problemas.map((p) => [p.campo, p.mensagem])));
    if (problemas.length) return;
    setSalvando(true);
    setErro(null);
    try {
      aoSalvar(await nucleo.criarProntuario(pessoaId, dados));
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} noValidate>
      <Stack gap="md">
        {erro && (
          <Alert color="red" variant="light" role="alert">
            {erro}
          </Alert>
        )}
        <Select
          label="Tipo sanguíneo"
          placeholder="Escolha"
          w={{ base: '100%', sm: 260 }}
          data={TIPOS_SANGUINEOS.map((t) => ({ value: t, label: t === 'DESCONHECIDO' ? 'Desconhecido' : t.replace('-', '−') }))}
          value={dados.tipoSanguineo ?? null}
          onChange={(valor) => mudar('tipoSanguineo', valor as TipoSanguineo | null)}
          clearable
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Textarea label="Alergias" autosize minRows={2} value={dados.alergias ?? ''} onChange={(e) => mudar('alergias', e.currentTarget.value)} error={erros.alergias} />
          <Textarea label="Comorbidades" placeholder="Hipertensão, diabetes..." autosize minRows={2} value={dados.comorbidades ?? ''} onChange={(e) => mudar('comorbidades', e.currentTarget.value)} error={erros.comorbidades} />
          <Textarea label="Medicamentos de uso contínuo" autosize minRows={2} value={dados.medicamentosUsoContinuo ?? ''} onChange={(e) => mudar('medicamentosUsoContinuo', e.currentTarget.value)} error={erros.medicamentosUsoContinuo} />
          <Textarea label="Observações" autosize minRows={2} value={dados.observacoes ?? ''} onChange={(e) => mudar('observacoes', e.currentTarget.value)} error={erros.observacoes} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button type="submit" loading={salvando}>
            Salvar prontuário e continuar
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
