"""Assunto, corpo e anexo do e-mail da ficha (docs/09-ficha-e-dominio.md, seção 9.6)."""

from typing import Any
from zoneinfo import ZoneInfo

from ..correio import Anexo, MensagemDeEmail
from ..ficha import formatos as f
from ..ficha.construtor import FichaGerada
from ..seguranca import ProfissionalAutenticado


def compor_mensagem(
    atendimento: dict[str, Any],
    para: str,
    ficha: FichaGerada,
    solicitante: ProfissionalAutenticado,
    fuso: ZoneInfo,
) -> MensagemDeEmail:
    nome = (atendimento.get("pessoa") or {}).get("nome") or "paciente"
    quando = f.instante(atendimento.get("dataHora"))
    data = quando.astimezone(fuso).strftime("%d/%m/%Y") if quando else "data não informada"
    hora = quando.astimezone(fuso).strftime("%H:%M") if quando else None

    origem = atendimento.get("origem") or {}
    responsavel = origem.get("criadoPorNome") or "a equipe de atendimento"
    if origem.get("criadoPorRegistro"):
        responsavel = f"{responsavel} ({origem['criadoPorRegistro']})"

    linhas = [
        "Olá,",
        "",
        f"Segue em anexo a ficha do atendimento pré-hospitalar de {nome}, realizado em {data}"
        + (f" às {hora}" if hora else "")
        + f" por {responsavel}.",
    ]
    if str(solicitante.id) != str(origem.get("criadoPorId")):
        linhas += ["", f"O envio foi solicitado por {solicitante.nome} ({solicitante.registro_completo})."]
    linhas += [
        "",
        "ATENÇÃO: esta mensagem e o anexo contêm dados pessoais sensíveis de saúde (LGPD). Não repasse a terceiros.",
        "",
        "--",
        "MedicalField · Prontuário Médico de Emergência",
        "Mensagem automática; não é preciso responder.",
    ]
    return MensagemDeEmail(
        para=para,
        assunto=f"MedicalField — Ficha de Atendimento de {nome} ({data})",
        texto="\n".join(linhas) + "\n",
        anexos=(Anexo(nome=ficha.nome_do_arquivo, tipo="application/pdf", conteudo=ficha.pdf),),
    )
