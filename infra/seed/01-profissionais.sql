-- Dados de demonstração, parte 1: profissionais (docs/11-roteiro-de-testes.md, seção 11.2).
-- Rodado por scripts/popular-demo.sh, que passa a senha das contas na variável "senha".
-- Pode rodar mais de uma vez: o que já existe não é duplicado.

DO $$
BEGIN
  IF to_regclass('auth.profissional') IS NULL THEN
    RAISE EXCEPTION 'As tabelas do ms-auth ainda não existem. Suba o ms-auth antes (docker compose up -d) e rode de novo.';
  END IF;
END
$$;

-- Profissionais (senha em bcrypt, gerada aqui mesmo pelo crypt() do pgcrypto)
INSERT INTO auth.profissional (nome, tipo_registro, registro, perfil, senha_hash) VALUES
  ('Dr. Ricardo Almeida', 'CRM',        '10001-RS',  'ADMIN',       crypt(:'senha', gen_salt('bf', 10))),
  ('Dra. Ana Souza',      'CRM',        '12345-RS',  'OPERACIONAL', crypt(:'senha', gen_salt('bf', 10))),
  ('Enf. Bruno Lima',     'COREN',      '543210-RS', 'OPERACIONAL', crypt(:'senha', gen_salt('bf', 10))),
  ('Carlos Pereira',      'SOCORRISTA', 'SOC-0001',  'OPERACIONAL', crypt(:'senha', gen_salt('bf', 10)))
ON CONFLICT DO NOTHING;


SELECT nome, tipo_registro, registro, perfil
  FROM auth.profissional
 ORDER BY perfil, nome;
