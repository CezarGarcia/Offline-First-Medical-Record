import {
  RiArrowRightLine,
  RiEyeLine,
  RiEyeOffLine,
  RiGitMergeLine,
  RiHeartPulseFill,
  RiLockLine,
  RiShieldCheckLine,
  RiWifiOffLine,
} from '@remixicon/react';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AuthCard } from '@/components/application/auth/auth-card';
import { Button } from '@/components/base/buttons/button';
import { Input, InputBase, TextField } from '@/components/base/input/input';
import { Label } from '@/components/base/input/label';
import { SegmentedControl, SegmentedControlItem } from '@/components/base/segmented-control/segmented-control';
import { SpinnerGlyph } from '@/components/base/spinner/spinner';
import { cx } from '@/utils/cx';
import { hora } from '@compartilhado/formatos';
import { TIPO_REGISTRO } from '@compartilhado/rotulos';
import type { RespostaDeErro, TipoRegistro } from '@compartilhado/tipos';
import { api } from '../api/cliente';
import { ErroDaApi, mensagemDoErro } from '../api/erros';
import { armazemDaSessao, useSessao } from '../api/sessao';
import { Aviso, useTitulo } from '../componentes/Pagina';

const EXEMPLO_DE_REGISTRO: Record<TipoRegistro, string> = {
  CRM: 'ex.: 10001-RS',
  COREN: 'ex.: 543210-RS',
  SOCORRISTA: 'ex.: SOC-0001',
};

export const ACESSO_RESTRITO = 'Acesso restrito a administradores. Para registrar atendimentos, use o app cliente.';

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

function Entrando({ className }: { className?: string }) {
  return <SpinnerGlyph size="sm" className={cx(className, 'text-current')} />;
}

const DESTAQUES = [
  { icone: RiWifiOffLine, titulo: 'Funciona sem internet', texto: 'As fichas feitas offline chegam aqui quando o aparelho sincroniza.' },
  { icone: RiGitMergeLine, titulo: 'Duplicados resolvidos', texto: 'Registros repetidos são juntados, e cada junção fica registrada.' },
  { icone: RiShieldCheckLine, titulo: 'Tudo auditado', texto: 'Cada acesso e cada ação dos aparelhos fica nos logs, sem edição.' },
];

/** O painel da direita: a marca e o que o portal mostra. */
function PainelDaMarca() {
  return (
    <div className="relative flex h-full flex-col justify-between gap-8 overflow-hidden bg-linear-to-br from-accent-600 via-accent-700 to-accent-950 p-8 text-white">
      {/* Linha de eletrocardiograma ao fundo */}
      <svg
        aria-hidden
        viewBox="0 0 400 120"
        className="pointer-events-none absolute inset-x-0 bottom-2 w-full opacity-20"
        fill="none"
      >
        <path
          d="M0 60h120l12-30 16 70 18-90 14 50h220"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ecg-linha"
        />
      </svg>
      <div className="relative flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          <RiHeartPulseFill className="size-5" aria-hidden />
        </span>
        <span className="flex flex-col">
          <span className="text-headline-semibold">MedicalField</span>
          <span className="text-caption-1-medium text-white/70">Prontuário offline-first</span>
        </span>
      </div>
      <ul className="relative flex flex-col gap-3">
        {DESTAQUES.map(({ icone: Icone, titulo, texto }, ordem) => (
          <li
            key={titulo}
            className="cartao-entra flex items-start gap-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur-sm"
            style={{ ['--ordem' as string]: ordem + 2 }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <Icone className="size-[18px]" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-body-medium">{titulo}</span>
              <span className="text-body-2-regular text-white/75">{texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const motivoDoFim = armazemDaSessao.motivoDoFim;

  if (sessao?.profissional.perfil === 'ADMIN') return <Navigate to={voltarPara} replace />;

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando || !registro.trim() || !senha) return;
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background-full p-4 sm:p-6">
      {/* Brilho suave da cor da marca atrás do cartão */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-[120px]"
      />
      <div className="pagina-entra relative w-full max-w-[880px]">
        <AuthCard
          title="Entrar no Portal Admin"
          description="Acesso de administradores do MedicalField."
          headingLevel={1}
          media={<PainelDaMarca />}
          logo={
            <span className="flex size-11 items-center justify-center rounded-xl bg-linear-to-b from-accent-500 to-accent-700 shadow-nav-selected md:hidden">
              <RiHeartPulseFill className="size-6 text-white" aria-hidden />
            </span>
          }
          footnote="Sessão guardada só nesta aba: fechar o navegador encerra o acesso."
        >
          <form onSubmit={entrar} noValidate className="flex flex-col gap-4">
            {motivoDoFim && !erro && <Aviso titulo={motivoDoFim} />}
            {erro && <Aviso tipo="error" titulo={erro} />}

            <div className="flex flex-col gap-1.5">
              <span id="rotulo-tipo-registro" className="text-body-medium text-text-primary">
                Tipo de registro
              </span>
              <SegmentedControl
                aria-labelledby="rotulo-tipo-registro"
                selectedKeys={[tipoRegistro]}
                onSelectionChange={(chaves) => {
                  const [escolhido] = [...chaves];
                  if (escolhido) setTipoRegistro(escolhido as TipoRegistro);
                }}
                className="flex w-full"
              >
                {(Object.keys(TIPO_REGISTRO) as TipoRegistro[]).map((tipo) => (
                  <SegmentedControlItem key={tipo} id={tipo} className="flex-1">
                    {TIPO_REGISTRO[tipo]}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </div>

            <Input
              label="Registro"
              placeholder={EXEMPLO_DE_REGISTRO[tipoRegistro]}
              value={registro}
              onChange={setRegistro}
              isRequired
              autoComplete="username"
              autoFocus
            />

            <TextField value={senha} onChange={setSenha} isRequired type={senhaVisivel ? 'text' : 'password'}>
              <Label isRequired>Senha</Label>
              <InputBase
                autoComplete="current-password"
                placeholder="Sua senha"
                leadingIcon={RiLockLine}
                trailingAddon={
                  <button
                    type="button"
                    aria-label={senhaVisivel ? 'Esconder a senha' : 'Mostrar a senha'}
                    aria-pressed={senhaVisivel}
                    onClick={() => setSenhaVisivel((visivel) => !visivel)}
                    className="-m-1 flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-foreground-icon-secondary outline-none transition-colors duration-150 hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                  >
                    {senhaVisivel ? <RiEyeOffLine className="size-5" aria-hidden /> : <RiEyeLine className="size-5" aria-hidden />}
                  </button>
                }
              />
            </TextField>

            <Button
              type="submit"
              className="mt-1 w-full"
              disabled={!registro.trim() || !senha}
              aria-busy={enviando || undefined}
              leadingIcon={enviando ? Entrando : undefined}
              trailingIcon={enviando ? undefined : RiArrowRightLine}
            >
              Entrar
            </Button>
          </form>
        </AuthCard>
      </div>
    </main>
  );
}
