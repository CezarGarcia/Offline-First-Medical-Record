import {
  Alert,
  Button,
  Center,
  Paper,
  PasswordInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconActivityHeartbeat, IconAlertTriangle, IconInfoCircle, IconLock } from '@tabler/icons-react';
import { hora } from '@compartilhado/formatos';
import { TIPO_REGISTRO } from '@compartilhado/rotulos';
import type { RespostaDeErro, TipoRegistro } from '@compartilhado/tipos';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api } from '../api/cliente';
import { ErroDaApi, mensagemDoErro } from '../api/erros';
import { armazemDaSessao, useSessao } from '../api/sessao';
import { useTitulo } from '../componentes/Pagina';

const EXEMPLO_DE_REGISTRO: Record<TipoRegistro, string> = {
  CRM: 'ex.: 10001-RS',
  COREN: 'ex.: 543210-RS',
  SOCORRISTA: 'ex.: SOC-0001',
};

export const ACESSO_RESTRITO =
  'Acesso restrito a administradores. Para registrar atendimentos, use o app cliente.';

function mensagemDoLogin(erro: unknown): string {
  if (erro instanceof ErroDaApi) {
    switch (erro.codigo) {
      case 'CREDENCIAIS_INVALIDAS':
        return 'Registro ou senha incorretos.';
      case 'CONTA_BLOQUEADA': {
        const ate = hora((erro.corpo as RespostaDeErro | null)?.bloqueadoAte);
        return `Muitas tentativas com senha errada. A conta fica bloqueada${ate ? ` até ${ate}` : ' por alguns minutos'}.`;
      }
      case 'PROFISSIONAL_INATIVO':
        return 'Este profissional está desativado.';
      default:
        return mensagemDoErro(erro);
    }
  }
  return mensagemDoErro(erro);
}

export function Login() {
  useTitulo('Entrar');
  const sessao = useSessao();
  const navegar = useNavigate();
  const local = useLocation();
  const voltarPara = (local.state as { voltarPara?: string } | null)?.voltarPara ?? '/atendimentos';

  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>('CRM');
  const [registro, setRegistro] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const motivoDoFim = armazemDaSessao.motivoDoFim;

  if (sessao?.profissional.perfil === 'ADMIN') return <Navigate to={voltarPara} replace />;

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await api.login(tipoRegistro, registro.trim(), senha);
      if (resposta.profissional.perfil !== 'ADMIN') {
        // O servidor aceitou o login, mas o portal é só para administradores (D-17): encerra a sessão criada
        await api.encerrarSessaoRecusada(resposta.tokenDeAcesso);
        setErro(ACESSO_RESTRITO);
        return;
      }
      armazemDaSessao.salvar(resposta);
      navegar(voltarPara, { replace: true });
    } catch (falha) {
      setErro(mensagemDoLogin(falha));
    } finally {
      setEnviando(false);
      setSenha('');
    }
  }

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Paper withBorder shadow="sm" radius="lg" p="xl" w="100%" maw={420}>
        <form onSubmit={entrar} noValidate>
          <Stack gap="md">
            <Stack gap={4} align="center">
              <ThemeIcon size={48} radius="md">
                <IconActivityHeartbeat size={30} />
              </ThemeIcon>
              <Title order={2}>MedicalField</Title>
              <Text c="dimmed" size="sm">
                Portal Admin · acesso de administradores
              </Text>
            </Stack>

            {motivoDoFim && !erro && (
              <Alert color="blue" variant="light" icon={<IconInfoCircle size={18} />}>
                {motivoDoFim}
              </Alert>
            )}
            {erro && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />} role="alert">
                {erro}
              </Alert>
            )}

            <div>
              <Text size="sm" fw={500} mb={4} id="rotulo-tipo-registro">
                Tipo de registro
              </Text>
              <SegmentedControl
                fullWidth
                aria-labelledby="rotulo-tipo-registro"
                value={tipoRegistro}
                onChange={(valor) => setTipoRegistro(valor as TipoRegistro)}
                data={(Object.keys(TIPO_REGISTRO) as TipoRegistro[]).map((tipo) => ({
                  value: tipo,
                  label: TIPO_REGISTRO[tipo],
                }))}
              />
            </div>
            <TextInput
              label="Registro"
              placeholder={EXEMPLO_DE_REGISTRO[tipoRegistro]}
              value={registro}
              onChange={(e) => setRegistro(e.currentTarget.value)}
              required
              autoComplete="username"
              autoFocus
            />
            <PasswordInput
              label="Senha"
              value={senha}
              onChange={(e) => setSenha(e.currentTarget.value)}
              required
              autoComplete="current-password"
            />
            <Button
              type="submit"
              loading={enviando}
              disabled={!registro.trim() || !senha}
              leftSection={<IconLock size={16} />}
              fullWidth
            >
              Entrar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
