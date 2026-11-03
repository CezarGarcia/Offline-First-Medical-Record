-- Dados de demonstração, parte 2: catálogo de medicamentos, 2 pacientes com prontuário e
-- 2 atendimentos (docs/11-roteiro-de-testes.md, seção 11.2). Precisa dos profissionais da parte 1.
-- Pode rodar mais de uma vez: o que já existe não é duplicado.

DO $$
BEGIN
  IF to_regclass('clinico.pessoa') IS NULL THEN
    RAISE EXCEPTION 'As tabelas do ms-clinico ainda não existem. Suba o ms-clinico antes (docker compose up -d) e rode de novo.';
  END IF;
END
$$;

-- Catálogo de medicamentos comuns no atendimento pré-hospitalar
INSERT INTO clinico.medicamento (nome, apresentacao, unidade_padrao) VALUES
  ('Ácido acetilsalicílico (AAS)', 'Comprimido 100 mg',        'MG'),
  ('Adrenalina (epinefrina)',      'Ampola 1 mg/mL',           'MG'),
  ('Amiodarona',                   'Ampola 150 mg/3 mL',       'MG'),
  ('Atropina',                     'Ampola 0,25 mg/mL',        'MG'),
  ('Diazepam',                     'Ampola 10 mg/2 mL',        'MG'),
  ('Dipirona',                     'Ampola 500 mg/mL (2 mL)',  'MG'),
  ('Glicose 50%',                  'Ampola 10 mL',             'ML'),
  ('Midazolam',                    'Ampola 15 mg/3 mL',        'MG'),
  ('Morfina',                      'Ampola 10 mg/mL',          'MG'),
  ('Ondansetrona',                 'Ampola 4 mg/2 mL',         'MG'),
  ('Salbutamol',                   'Aerossol 100 mcg/dose',    'MCG'),
  ('Soro fisiológico 0,9%',        'Frasco 500 mL',            'ML')
ON CONFLICT DO NOTHING;

-- Quem registrou os dados de demonstração
SELECT id AS ana_id FROM auth.profissional WHERE tipo_registro = 'CRM' AND upper(registro) = '12345-RS' \gset
SELECT id AS bruno_id FROM auth.profissional WHERE tipo_registro = 'COREN' AND upper(registro) = '543210-RS' \gset

INSERT INTO clinico.pessoa
  (id, nome, cpf, data_nascimento, sexo, telefone, email,
   contato_nome, contato_parentesco, contato_telefone, contato_email,
   criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
   modo_registro, sincronizado_por_id)
VALUES
  ('0193f000-0000-7000-8000-000000000101', 'João da Silva', '52998224725', '1980-05-10', 'MASCULINO',
   '51999990000', 'joao.silva@exemplo.com', 'Maria da Silva', 'Esposa', '51988880000', 'maria.silva@exemplo.com',
   :'ana_id', 'Dra. Ana Souza', 'CRM 12345-RS', '2026-10-28 14:35:00+00',
   '0193f000-0000-7000-8000-00000000a001', 'Ambulância 01', 'ONLINE', :'ana_id'),
  ('0193f000-0000-7000-8000-000000000102', 'Ana Beatriz Costa', '11144477735', '1992-08-21', 'FEMININO',
   '51977770000', NULL, 'Pedro Costa', 'Irmão', '51966660000', 'pedro.costa@exemplo.com',
   :'bruno_id', 'Enf. Bruno Lima', 'COREN 543210-RS', '2026-10-30 09:25:00+00',
   '0193f000-0000-7000-8000-00000000a002', 'Ambulância 02', 'ONLINE', :'bruno_id')
ON CONFLICT DO NOTHING;

INSERT INTO clinico.prontuario
  (id, pessoa_id, tipo_sanguineo, alergias, comorbidades, medicamentos_uso_continuo, observacoes,
   criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
   modo_registro, sincronizado_por_id)
VALUES
  ('0193f000-0000-7000-8000-000000000201', '0193f000-0000-7000-8000-000000000101', 'O+', 'Dipirona',
   'Hipertensão', 'Losartana 50 mg', NULL,
   :'ana_id', 'Dra. Ana Souza', 'CRM 12345-RS', '2026-10-28 14:36:00+00',
   '0193f000-0000-7000-8000-00000000a001', 'Ambulância 01', 'ONLINE', :'ana_id'),
  ('0193f000-0000-7000-8000-000000000202', '0193f000-0000-7000-8000-000000000102', 'A-', NULL,
   'Asma', 'Salbutamol quando necessário', NULL,
   :'bruno_id', 'Enf. Bruno Lima', 'COREN 543210-RS', '2026-10-30 09:26:00+00',
   '0193f000-0000-7000-8000-00000000a002', 'Ambulância 02', 'ONLINE', :'bruno_id')
ON CONFLICT DO NOTHING;

INSERT INTO clinico.atendimento
  (id, prontuario_id, data_hora, local_ocorrencia, tipo_ocorrencia, queixa_principal,
   triagem_protocolo, triagem_cor, glasgow_ocular, glasgow_verbal, glasgow_motora,
   pa_sistolica, pa_diastolica, freq_cardiaca, freq_respiratoria, spo2, temperatura, glicemia,
   procedimentos, desfecho, destino, observacoes,
   criado_por_id, criado_por_nome, criado_por_registro, criado_em, dispositivo_id, dispositivo_nome,
   modo_registro, sincronizado_por_id)
VALUES
  ('0193f000-0000-7000-8000-000000000301', '0193f000-0000-7000-8000-000000000201', '2026-10-28 14:20:00+00',
   'Av. Benjamin Constant, centro de Lajeado', 'CLINICA', 'Dor no peito há cerca de uma hora',
   'MANCHESTER', 'LARANJA', 4, 5, 6, 150, 95, 102, 20, 95, 36.6, 130,
   'Monitorização cardíaca; oxigênio 2 L/min', 'ENCAMINHADO_HOSPITAL', 'Hospital Regional', NULL,
   :'ana_id', 'Dra. Ana Souza', 'CRM 12345-RS', '2026-10-28 14:40:00+00',
   '0193f000-0000-7000-8000-00000000a001', 'Ambulância 01', 'ONLINE', :'ana_id'),
  ('0193f000-0000-7000-8000-000000000302', '0193f000-0000-7000-8000-000000000202', '2026-10-30 09:10:00+00',
   'BR-386, km 345', 'TRAUMA', 'Queda de moto, dor no braço esquerdo',
   'MANCHESTER', 'AMARELO', 4, 5, 6, 120, 80, 95, 18, 98, 36.4, NULL,
   'Imobilização do braço esquerdo', 'ENCAMINHADO_HOSPITAL', 'Hospital Regional', NULL,
   :'bruno_id', 'Enf. Bruno Lima', 'COREN 543210-RS', '2026-10-30 09:30:00+00',
   '0193f000-0000-7000-8000-00000000a002', 'Ambulância 02', 'ONLINE', :'bruno_id')
ON CONFLICT DO NOTHING;

INSERT INTO clinico.atendimento_medicamento (id, atendimento_id, medicamento_id, dose, unidade, via, horario, observacao)
SELECT '0193f000-0000-7000-8000-000000000401', '0193f000-0000-7000-8000-000000000301', id,
       200, 'MG', 'ORAL', '2026-10-28 14:28:00+00', 'Mastigar'
  FROM clinico.medicamento WHERE nome = 'Ácido acetilsalicílico (AAS)'
ON CONFLICT DO NOTHING;

INSERT INTO clinico.atendimento_medicamento (id, atendimento_id, medicamento_id, dose, unidade, via, horario, observacao)
SELECT '0193f000-0000-7000-8000-000000000402', '0193f000-0000-7000-8000-000000000302', id,
       1, 'G', 'INTRAVENOSA', '2026-10-30 09:18:00+00', NULL
  FROM clinico.medicamento WHERE nome = 'Dipirona'
ON CONFLICT DO NOTHING;

SELECT 'medicamentos' AS tabela, count(*) FROM clinico.medicamento
UNION ALL SELECT 'pessoas', count(*) FROM clinico.pessoa
UNION ALL SELECT 'prontuarios', count(*) FROM clinico.prontuario
UNION ALL SELECT 'atendimentos', count(*) FROM clinico.atendimento;
