import { Alert, Button, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type FormEvent, useState } from 'react';
import { mensagemDoErro, nucleo, useEstadoDoApp } from '../nucleo';

/** Sessão sem token (login offline e app reaberto, ou sessão do servidor vencida): a senha, para entrar online. */
export function JanelaSenhaOnline({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const estado = useEstadoDoApp();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await nucleo.confirmarSenhaOnline(senha);
      notifications.show({ color: 'teal', title: 'Entrou online', message: 'A sincronização começou.' });
      setSenha('');
      aoFechar();
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal opened={aberta} onClose={aoFechar} title="Entrar online" centered>
      <form onSubmit={entrar}>
        <Stack>
          <Text size="sm">
            {estado?.sessao?.profissional.nome}, digite a sua senha para o app conseguir sincronizar com o servidor.
          </Text>
          {erro && (
            <Alert color="red" variant="light" role="alert">
              {erro}
            </Alert>
          )}
          <PasswordInput label="Senha" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} data-autofocus required />
          <Group justify="flex-end">
            <Button variant="default" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" loading={enviando} disabled={!senha}>
              Entrar online
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
