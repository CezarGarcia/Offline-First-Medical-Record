import { Alert, Button, Group, Modal, Radio, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconMailForward, IconWifiOff } from '@tabler/icons-react';
import type { TipoDestinatario } from '@compartilhado/tipos';
import { FORMATO_EMAIL } from '@compartilhado/validacao';
import { useEffect, useState } from 'react';
import type { AtendimentoDetalheLocal } from '../../../comum/contrato';
import { errosPorCampo, mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';

interface Props {
  atendimento: AtendimentoDetalheLocal;
  aberta: boolean;
  aoFechar: () => void;
}

/**
 * Envio da ficha por e-mail (docs/10, seção 10.1). O pedido entra na fila do aparelho, como os cadastros: online,
 * sai na hora; offline, sai quando a conexão voltar. O ID do pedido é a chave de idempotência do ms-docs (D-36).
 */
export function JanelaEmail({ atendimento, aberta, aoFechar }: Props) {
  const estado = useEstadoDoApp();
  const offline = estado?.conectividade === 'OFFLINE';
  const emailDoPaciente = atendimento.pessoa.email;
  const emailDoFamiliar = atendimento.pessoa.contato?.email ?? null;
  const [tipo, setTipo] = useState<TipoDestinatario>('OUTRO');
  const [outro, setOutro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setTipo(emailDoFamiliar ? 'FAMILIAR' : emailDoPaciente ? 'PACIENTE' : 'OUTRO');
    setOutro('');
    setErro(null);
    setErroDoCampo(null);
  }, [aberta, emailDoFamiliar, emailDoPaciente]);

  const emailInvalido = tipo === 'OUTRO' && !FORMATO_EMAIL.test(outro.trim());

  async function pedir() {
    setEnviando(true);
    setErro(null);
    try {
      await nucleo.pedirEmail(atendimento.id, tipo === 'OUTRO' ? { tipo, email: outro.trim() } : { tipo });
      notifications.show({
        color: offline ? 'orange' : 'teal',
        title: 'Pedido de e-mail salvo',
        message: offline
          ? 'O envio vai para a fila e sai quando a conexão voltar.'
          : 'Enviando agora. O resultado aparece em "E-mails desta ficha".',
      });
      aoFechar();
    } catch (falha) {
      setErroDoCampo(errosPorCampo(falha)['destinatario.email'] ?? null);
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal opened={aberta} onClose={aoFechar} title="Enviar a ficha por e-mail" centered size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          A ficha em PDF vai anexada. O e-mail avisa que o conteúdo tem dados sensíveis (LGPD).
        </Text>
        <Radio.Group value={tipo} onChange={(valor) => setTipo(valor as TipoDestinatario)} label="Para quem">
          <Stack gap="xs" mt="xs">
            {/* Paciente e Familiar só aparecem se houver e-mail no cadastro (docs/10, seção 10.1) */}
            {emailDoPaciente && <Radio value="PACIENTE" label="Paciente" description={emailDoPaciente} />}
            {emailDoFamiliar && (
              <Radio
                value="FAMILIAR"
                label="Familiar"
                description={`${atendimento.pessoa.contato?.nome ?? 'Contato'} · ${emailDoFamiliar}`}
              />
            )}
            <Radio value="OUTRO" label="Outro endereço" description="Digite o e-mail abaixo" />
          </Stack>
        </Radio.Group>
        {tipo === 'OUTRO' && (
          <TextInput
            label="E-mail"
            placeholder="nome@exemplo.com"
            value={outro}
            onChange={(e) => setOutro(e.currentTarget.value)}
            error={erroDoCampo ?? (outro && emailInvalido ? 'E-mail inválido' : undefined)}
            data-autofocus
          />
        )}
        {offline && (
          <Alert color="orange" variant="light" icon={<IconWifiOff size={18} />}>
            Modo offline: o envio vai para a fila e sai quando a conexão voltar.
          </Alert>
        )}
        {erro && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} role="alert">
            {erro}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button leftSection={<IconMailForward size={16} />} onClick={pedir} loading={enviando} disabled={emailInvalido}>
            {offline ? 'Colocar na fila' : 'Enviar'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
