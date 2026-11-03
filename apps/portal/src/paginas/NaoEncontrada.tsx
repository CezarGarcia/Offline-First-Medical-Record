import { RiCompass3Line, RiFirstAidKitLine } from '@remixicon/react';
import { BotaoLink } from '../componentes/BotaoLink';
import { Cartao, useTitulo } from '../componentes/Pagina';

export function NaoEncontrada() {
  useTitulo('Página não encontrada');
  return (
    <Cartao className="pagina-entra mx-auto mt-10 flex max-w-lg flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-background-tertiary-default">
        <RiCompass3Line className="size-7 text-foreground-icon-secondary" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-title-2-medium text-text-primary">Página não encontrada</h1>
        <p className="text-body-regular text-text-secondary">O endereço não existe no portal.</p>
      </div>
      <BotaoLink para="/atendimentos" variante="primary" icone={RiFirstAidKitLine}>
        Ir para os atendimentos
      </BotaoLink>
    </Cartao>
  );
}
