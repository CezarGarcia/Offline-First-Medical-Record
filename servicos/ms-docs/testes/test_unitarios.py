"""Testes sem banco: formatação da ficha, configuração, IDs e mensagens de validação."""

import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from ms_docs.config import ErroDeConfiguracao, config_smtp
from ms_docs.erros import detalhes_de_validacao
from ms_docs.ficha import formatos as f
from ms_docs.ids import uuid7

FUSO = ZoneInfo("America/Sao_Paulo")


def test_cpf_e_telefone():
    assert f.cpf("52998224725") == "529.982.247-25"
    assert f.cpf(None) is None
    assert f.telefone("51999990000") == "(51) 99999-0000"
    assert f.telefone("5137140000") == "(51) 3714-0000"
    assert f.telefone("+55 51 9999") == "+55 51 9999"


def test_numeros_com_virgula():
    assert f.numero(200.0) == "200"
    assert f.numero(0.5) == "0,5"
    assert f.numero(36.6) == "36,6"
    assert f.numero(1500) == "1500"
    assert f.numero(None) is None


def test_datas_no_horario_de_brasilia():
    instante = f.instante("2026-10-28T14:20:00Z")
    assert f.data_hora(instante, FUSO) == "28/10/2026 11:20"
    assert f.hora(f.instante("2026-10-28T14:28:00Z"), FUSO, date(2026, 10, 28)) == "11:28"
    # Passou da meia-noite: mostra o dia junto
    assert f.hora(f.instante("2026-10-29T03:10:00Z"), FUSO, date(2026, 10, 28)) == "29/10 00:10"


def test_idade():
    assert f.idade(date(1980, 5, 10), date(2026, 5, 9)) == 45
    assert f.idade(date(1980, 5, 10), date(2026, 5, 10)) == 46
    assert f.idade(date(2027, 1, 1), date(2026, 5, 10)) is None


def test_numero_da_ficha_usa_o_final_do_id():
    # Dois UUID v7 do mesmo minuto têm o mesmo começo; o final é o que muda
    assert f.numero_da_ficha("0193f000-0000-7000-8000-000000000301") == "00000301"
    assert f.numero_da_ficha("01a1a16c-e8b4-79bf-94b4-e9b2eedfce8c") == "EEDFCE8C"


def test_glasgow_e_rotulos():
    assert [f.gravidade_glasgow(t) for t in (15, 13, 12, 9, 8, 3)] == [
        "leve",
        "leve",
        "moderado",
        "moderado",
        "grave",
        "grave",
    ]
    assert f.rotulo(f.VIA, "SUBCUTANEA") == "Subcutânea"
    assert f.rotulo(f.VIA, "NOVA_VIA") == "NOVA_VIA"
    assert f.tipo_sanguineo("AB-") == "AB−"
    assert f.tipo_sanguineo("DESCONHECIDO") == "Desconhecido"


def test_uuid7():
    antes = uuid7()
    depois = uuid7()
    assert antes.version == 7
    assert antes.variant == uuid.RFC_4122
    milissegundos = antes.int >> 80
    assert abs(milissegundos - datetime.now(UTC).timestamp() * 1000) < 5000
    assert str(antes)[:8] <= str(depois)[:8]


def test_config_smtp():
    assert config_smtp({}) is None
    gmail = config_smtp(
        {"SMTP_HOST": "smtp.gmail.com", "SMTP_USUARIO": "conta@gmail.com", "SMTP_SENHA": "abcd efgh ijkl mnop"}
    )
    assert gmail.porta == 587
    assert gmail.seguranca == "STARTTLS"
    assert gmail.senha == "abcdefghijklmnop"  # a senha de app vem com espaços; eles não fazem parte dela
    assert gmail.remetente == "conta@gmail.com"
    assert config_smtp({"SMTP_HOST": "h", "SMTP_PORTA": "465", "SMTP_REMETENTE": "a@b.c"}).seguranca == "SSL"
    com_nome = config_smtp({"SMTP_HOST": "h", "SMTP_REMETENTE": "Projeto MF <conta@gmail.com>"})
    assert (com_nome.nome_remetente, com_nome.remetente) == ("Projeto MF", "conta@gmail.com")
    assert gmail.nome_remetente == "MedicalField"
    with pytest.raises(ErroDeConfiguracao):
        config_smtp({"SMTP_HOST": "h", "SMTP_USUARIO": "conta@gmail.com"})
    with pytest.raises(ErroDeConfiguracao):
        config_smtp({"SMTP_HOST": "h", "SMTP_REMETENTE": "a@b.c", "SMTP_SEGURANCA": "TLS"})


def test_mensagens_de_validacao_em_portugues():
    erros = [
        {"type": "missing", "loc": ("body", "destinatario"), "msg": "Field required"},
        {
            "type": "literal_error",
            "loc": ("body", "destinatario", "tipo"),
            "msg": "x",
            "ctx": {"expected": "'PACIENTE', 'FAMILIAR' or 'OUTRO'"},
        },
        {"type": "json_invalid", "loc": ("body", 3), "msg": "JSON decode error"},
    ]
    assert detalhes_de_validacao(erros) == [
        {"campo": "destinatario", "mensagem": "campo obrigatório"},
        {"campo": "destinatario.tipo", "mensagem": "valor não permitido (use: PACIENTE, FAMILIAR, OUTRO)"},
        {"campo": "corpo", "mensagem": "JSON inválido"},
    ]
