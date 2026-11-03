/**
 * O jsdom dos testes de tela, mas com os módulos transformados como no Node (ambiente "ssr" do Vite): as telas
 * rodam no jsdom e o núcleo de verdade, atrás da ponte falsa, usa o node:sqlite. No ambiente "client" padrão
 * do jsdom, o Vite se recusa a carregar módulos internos do Node.
 */
import { type Environment, builtinEnvironments } from 'vitest/runtime';

const ambiente: Environment = {
  ...builtinEnvironments.jsdom,
  name: 'jsdom-com-node',
  viteEnvironment: 'ssr',
};

export default ambiente;
