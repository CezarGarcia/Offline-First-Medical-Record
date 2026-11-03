import { Alert, Button, Group, Modal, Radio, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconMailForward } from '@tabler/icons-react';
import { uuid7 } from '@compartilhado/ids';
import type { AtendimentoDetalhe, EnvioEmail, TipoDestinatario } from '@compartilhado/tipos';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api/cliente';
import { mensagemDoErro } from '../api/erros';

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PropsDaJanela {
  atendimento: AtendimentoDetalhe;
  aberta: boolean;
  aoFechar: () => void;
}

/**
 * Envio da ficha por e-mail. O ID do pedido é gerado quando a janela abre e reaproveitado em cada tentativa:
 * clicar duas vezes, ou tentar de novo depois de um erro, nunca manda dois e-mails (D-36).
 */
export function JanelaEmail({ atendimento, aberta, aoFechar }: PropsDaJanela) {
  const consultas = useQueryClient();
  const emailDoPaciente = atendimento.pessoa.email;
  const emailDoFamiliar = atendimento.pessoa.contato?.email ?? null;
  const [pedidoId, setPedidoId] = useState(uuid7);
  const [tipo, setTipo] = useState<TipoDestinatario>('OUTRO');
  const [outro, setOutro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    // Um pedido novo a cada vez que a janela abre
    setPedidoId(uuid7());
    setTipo(emailDoFamiliar ? 'FAMILIAR' : emailDoPaciente ? 'PACIENTE' : 'OUTRO');
    setOutro('');
    setErro(null);
  }, [aberta, emailDoFamiliar, emailDoPaciente]);

  const emailInvalido = tipo === 'OUTRO' && !FORMATO_EMAIL.test(outro.trim());

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await api.requisitar(`/documentos/ficha/${atendimento.id}/email`, {
        metodo: 'POST',
        corpo: {
          id: pedidoId,
          destinatario: tipo === 'OUTRO' ? { tipo, email: outro.trim() } : { tipo },
        },
      });
      const envio = (await resposta.json()) as EnvioEmail;
      notifications.show({
        color: 'teal',
        title: resposta.status === 201 ? 'E-mail enviado' : 'Este pedido já tinha sido enviado',
        message: `Ficha enviada para ${envio.destinatarioEmail}.`,
      });
      void consultas.invalidateQueries({ queryKey: ['envios-email'] });
      aoFechar();
    } catch (falha) {
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
            <Radio
              value="PACIENTE"
              disabled={!emailDoPaciente}
              label="Paciente"
              description={emailDoPaciente ?? 'Sem e-mail no cadastro da pessoa'}
            />
            <Radio
              value="FAMILIAR"
              disabled={!emailDoFamiliar}
              label="Familiar"
              description={
                emailDoFamiliar
                  ? `${atendimento.pessoa.contato?.nome ?? 'Contato'} · ${emailDoFamiliar}`
                  : 'Sem e-mail no contato do familiar'
              }
            />
            <Radio value="OUTRO" label="Outro endereço" description="Digite o e-mail abaixo" />
          </Stack>
        </Radio.Group>
        {tipo === 'OUTRO' && (
          <TextInput
            label="E-mail"
            placeholder="nome@exemplo.com"
            value={outro}
            onChange={(e) => setOutro(e.currentTarget.value)}
            error={outro && emailInvalido ? 'E-mail inválido' : undefined}
            data-autofocus
          />
        )}
        {erro && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} role="alert">
            {erro} Você pode tentar de novo: o mesmo pedido não manda dois e-mails.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button leftSection={<IconMailForward size={16} />} onClick={enviar} loading={enviando} disabled={emailInvalido}>
            {erro ? 'Tentar de novo' : 'Enviar'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
