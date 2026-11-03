import { Alert, Button, Code, Group, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { MODO, TIPO_REGISTRO, rotulo } from '@compartilhado/rotulos';
import { type FormEvent, useEffect, useState } from 'react';
import { Campos, Pagina, Secao } from '../componentes/Basicos';
import { errosPorCampo, mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';

/** Versão, dispositivo, servidor, perfil em uso e o caminho do banco local (docs/10, seção 10.1). */
export function Sobre() {
  const estado = useEstadoDoApp();
  const [servidorUrl, setServidorUrl] = useState(estado?.servidorUrl ?? '');
  const [dispositivoNome, setDispositivoNome] = useState(estado?.dispositivo?.nome ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setServidorUrl(estado?.servidorUrl ?? '');
    setDispositivoNome(estado?.dispositivo?.nome ?? '');
  }, [estado?.servidorUrl, estado?.dispositivo?.nome]);

  if (!estado) return null;
  const mudou = servidorUrl.trim() !== (estado.servidorUrl ?? '') || dispositivoNome.trim() !== (estado.dispositivo?.nome ?? '');

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    setErros({});
    try {
      await nucleo.configurar({ servidorUrl, dispositivoNome });
      notifications.show({ color: 'teal', title: 'Configuração salva', message: 'Vale a partir da próxima sincronização.' });
    } catch (falha) {
      setErros(errosPorCampo(falha));
      setErro(mensagemDoErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  const sessao = estado.sessao;
  return (
    <Pagina titulo="Sobre" descricao="MedicalField: prontuário eletrônico offline-first para o atendimento pré-hospitalar.">
      <Secao titulo="Este aparelho">
        <Campos
          campos={[
            { rotulo: 'Versão do app', valor: estado.versao, destaque: true },
            { rotulo: 'Nome do dispositivo', valor: estado.dispositivo?.nome },
            { rotulo: 'ID do dispositivo', valor: estado.dispositivo ? <Code>{estado.dispositivo.id}</Code> : null },
            { rotulo: 'Endereço do servidor', valor: estado.servidorUrl },
            { rotulo: 'Perfil em uso (--perfil)', valor: <Code>{estado.perfil}</Code> },
            { rotulo: 'Chave de conectividade', valor: rotulo(MODO, estado.conectividade) },
            {
              rotulo: 'Arquivo do banco local',
              valor: <Code style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{estado.caminhoDoBanco}</Code>,
              largo: true,
            },
          ]}
        />
      </Secao>

      {sessao && (
        <Secao titulo="Sessão">
          <Campos
            campos={[
              { rotulo: 'Profissional', valor: sessao.profissional.nome, destaque: true },
              {
                rotulo: 'Registro',
                valor: `${rotulo(TIPO_REGISTRO, sessao.profissional.tipoRegistro)} ${sessao.profissional.registro}`,
              },
              { rotulo: 'Como entrou', valor: rotulo(MODO, sessao.modoLogin) },
              { rotulo: 'Sincronização', valor: sessao.precisaLoginOnline ? 'precisa de login online' : 'liberada' },
            ]}
          />
        </Secao>
      )}

      <Secao titulo="Configuração">
        <form onSubmit={salvar} noValidate>
          <Stack gap="md" maw={560}>
            {erro && (
              <Alert color="red" variant="light" role="alert">
                {erro}
              </Alert>
            )}
            <TextInput
              label="Endereço do servidor"
              description="Os pendentes vão para o novo endereço. Pode ser preciso entrar online de novo."
              value={servidorUrl}
              onChange={(e) => setServidorUrl(e.currentTarget.value)}
              error={erros.servidorUrl}
              required
            />
            <TextInput
              label="Nome deste dispositivo"
              description="Vale para os próximos registros; os já salvos guardam o nome da época."
              value={dispositivoNome}
              onChange={(e) => setDispositivoNome(e.currentTarget.value)}
              error={erros.dispositivoNome}
              required
            />
            <Group>
              <Button type="submit" leftSection={<IconDeviceFloppy size={16} />} loading={salvando} disabled={!mudou}>
                Salvar configuração
              </Button>
            </Group>
          </Stack>
        </form>
      </Secao>

      <Text size="xs" c="dimmed">
        Trabalho final de Arquiteturas de Software · Univates 2026/B.
      </Text>
    </Pagina>
  );
}
