"""Como cada valor aparece na ficha: rótulos das listas fixas, datas no horário de Brasília, CPF, telefone..."""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

SEXO = {"MASCULINO": "Masculino", "FEMININO": "Feminino", "OUTRO": "Outro", "NAO_INFORMADO": "Não informado"}

TIPO_OCORRENCIA = {
    "CLINICA": "Clínica",
    "TRAUMA": "Trauma",
    "OBSTETRICA": "Obstétrica",
    "PSIQUIATRICA": "Psiquiátrica",
    "OUTRO": "Outro",
}

PROTOCOLO = {"MANCHESTER": "Manchester", "START": "START"}

COR = {
    "VERMELHO": "Vermelho",
    "LARANJA": "Laranja",
    "AMARELO": "Amarelo",
    "VERDE": "Verde",
    "AZUL": "Azul",
    "PRETO": "Preto",
}

# Cor de fundo e do texto da etiqueta da triagem no PDF
COR_HEX = {
    "VERMELHO": ("#c62828", "#ffffff"),
    "LARANJA": ("#ef6c00", "#ffffff"),
    "AMARELO": ("#f9c80e", "#1f2937"),
    "VERDE": ("#2e7d32", "#ffffff"),
    "AZUL": ("#1565c0", "#ffffff"),
    "PRETO": ("#1f2937", "#ffffff"),
}

# docs/09-ficha-e-dominio.md, seção 9.4 (Triagem)
SIGNIFICADO_MANCHESTER = {
    "VERMELHO": "Emergência · atendimento imediato",
    "LARANJA": "Muito urgente · até 10 min",
    "AMARELO": "Urgente · até 60 min",
    "VERDE": "Pouco urgente · até 120 min",
    "AZUL": "Não urgente · até 240 min",
}
SIGNIFICADO_START = {
    "VERMELHO": "Atendimento imediato",
    "AMARELO": "Atendimento pode ser adiado",
    "VERDE": "Ferimentos leves · pode esperar",
    "PRETO": "Óbito ou sem chance de sobrevida",
}

GLASGOW_OCULAR = {4: "Espontânea", 3: "Ao som", 2: "À pressão", 1: "Ausente"}
GLASGOW_VERBAL = {5: "Orientada", 4: "Confusa", 3: "Palavras", 2: "Sons", 1: "Ausente"}
GLASGOW_MOTORA = {
    6: "Obedece a comandos",
    5: "Localiza",
    4: "Flexão normal",
    3: "Flexão anormal",
    2: "Extensão",
    1: "Ausente",
}

UNIDADE = {
    "MG": "mg",
    "MCG": "mcg",
    "G": "g",
    "ML": "mL",
    "UI": "UI",
    "GOTA": "gota(s)",
    "COMPRIMIDO": "comprimido(s)",
    "AMPOLA": "ampola(s)",
    "OUTRA": "(outra unidade)",
}

VIA = {
    "INTRAVENOSA": "Intravenosa",
    "INTRAMUSCULAR": "Intramuscular",
    "SUBCUTANEA": "Subcutânea",
    "ORAL": "Oral",
    "SUBLINGUAL": "Sublingual",
    "INALATORIA": "Inalatória",
    "INTRAOSSEA": "Intraóssea",
    "TOPICA": "Tópica",
    "OUTRA": "Outra",
}

DESFECHO = {
    "ENCAMINHADO_HOSPITAL": "Encaminhado ao hospital",
    "LIBERADO_NO_LOCAL": "Liberado no local",
    "RECUSOU_ATENDIMENTO": "Recusou atendimento",
    "OBITO": "Óbito",
}

MODO = {"ONLINE": "Online", "OFFLINE": "Offline"}


def rotulo(tabela: dict[str, str], valor: str | None) -> str | None:
    """O rótulo em português; um valor fora da lista aparece como veio (nunca some da ficha)."""
    if valor is None:
        return None
    return tabela.get(valor, valor)


def tipo_sanguineo(valor: str | None) -> str | None:
    if valor is None:
        return None
    if valor == "DESCONHECIDO":
        return "Desconhecido"
    return valor.replace("-", "−")  # sinal de menos tipográfico: "A−"


def instante(texto: str | None) -> datetime | None:
    if not texto:
        return None
    return datetime.fromisoformat(texto.replace("Z", "+00:00"))


def data_iso(texto: str | None) -> date | None:
    if not texto:
        return None
    return date.fromisoformat(texto)


def data_hora(valor: datetime | None, fuso: ZoneInfo) -> str | None:
    """No horário de Brasília (D-23): "28/10/2026 11:20"."""
    if valor is None:
        return None
    return valor.astimezone(fuso).strftime("%d/%m/%Y %H:%M")


def data(valor: date | None) -> str | None:
    return valor.strftime("%d/%m/%Y") if valor else None


def hora(valor: datetime | None, fuso: ZoneInfo, referencia: date | None = None) -> str | None:
    """Só a hora quando é no mesmo dia da referência; senão, com o dia: "28/10 23:50"."""
    if valor is None:
        return None
    local = valor.astimezone(fuso)
    if referencia is not None and local.date() == referencia:
        return local.strftime("%H:%M")
    return local.strftime("%d/%m %H:%M")


def idade(nascimento: date | None, referencia: date) -> int | None:
    if nascimento is None or nascimento > referencia:
        return None
    anos = referencia.year - nascimento.year
    if (referencia.month, referencia.day) < (nascimento.month, nascimento.day):
        anos -= 1
    return anos


def cpf(valor: str | None) -> str | None:
    if not valor:
        return None
    if re.fullmatch(r"\d{11}", valor):
        return f"{valor[:3]}.{valor[3:6]}.{valor[6:9]}-{valor[9:]}"
    return valor


def telefone(valor: str | None) -> str | None:
    """Com DDD: "(51) 99999-0000" (celular) ou "(51) 3714-0000" (fixo). Outros formatos aparecem como vieram."""
    if not valor:
        return None
    digitos = re.sub(r"\D", "", valor)
    if len(digitos) == 11:
        return f"({digitos[:2]}) {digitos[2:7]}-{digitos[7:]}"
    if len(digitos) == 10:
        return f"({digitos[:2]}) {digitos[2:6]}-{digitos[6:]}"
    return valor


def numero(valor: float | int | Decimal | None) -> str | None:
    """Com vírgula e sem zeros à toa: 200.0 → "200", 0.5 → "0,5", 36.6 → "36,6"."""
    if valor is None:
        return None
    texto = format(Decimal(str(valor)).normalize(), "f")
    return texto.replace(".", ",")


def numero_da_ficha(atendimento_id: str | uuid.UUID) -> str:
    """Os 8 últimos caracteres do ID, em maiúsculas (ex.: "9F3A1C2B").

    O começo de um UUID v7 é a hora em que ele foi criado, então dois atendimentos do mesmo minuto teriam o
    mesmo início. O final é aleatório: é o que distingue um atendimento do outro (D-37).
    """
    return str(atendimento_id).replace("-", "")[-8:].upper()


def gravidade_glasgow(total: int) -> str:
    if total >= 13:
        return "leve"
    if total >= 9:
        return "moderado"
    return "grave"
