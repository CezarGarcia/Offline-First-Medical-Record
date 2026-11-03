"""PDF da Ficha de Atendimento (docs/09-ficha-e-dominio.md, seção 9.5).

Padrão **Builder**: o `FichaPdfBuilder` monta o documento seção por seção (cabeçalho, paciente, prontuário,
ocorrência, triagem, avaliação, medicamentos, desfecho e rodapé) e só no `construir()` gera o PDF. Quem
decide a ordem das seções é o `MontadorDaFicha` (o "diretor" do padrão), a partir do JSON do ms-clinico.
Cada seção é um macro do modelo HTML (modelos/ficha.html); o WeasyPrint transforma o HTML + CSS em PDF.
"""

import threading
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Self
from zoneinfo import ZoneInfo

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup
from weasyprint import CSS, HTML

from . import formatos as f

PASTA_MODELOS = Path(__file__).resolve().parent / "modelos"

_ambiente = Environment(
    loader=FileSystemLoader(PASTA_MODELOS),
    autoescape=select_autoescape(["html"]),
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
_estilo = CSS(filename=str(PASTA_MODELOS / "ficha.css"))
_uma_geracao_por_vez = threading.Lock()


def _macros() -> Any:
    return _ambiente.get_template("ficha.html").module


@dataclass(frozen=True)
class Campo:
    rotulo: str
    valor: str | None
    # Quantas das 3 colunas da seção o campo ocupa (3 = a linha inteira, para textos longos)
    colunas: int = 1
    destaque: bool = False


class FichaPdfBuilder:
    def __init__(self, fuso: ZoneInfo, gerado_em: datetime):
        self._fuso = fuso
        self._gerado_em = gerado_em
        self._macros = _macros()
        self._secoes: list[Markup] = []
        self._numero = ""
        self._titulo = "Ficha de Atendimento"
        # Data do atendimento: base para a idade do paciente e para os horários dos medicamentos
        self._referencia: date = gerado_em.astimezone(fuso).date()

    def cabecalho(self, atendimento_id: str, data_hora: datetime | None) -> Self:
        self._numero = f.numero_da_ficha(atendimento_id)
        if data_hora is not None:
            self._referencia = data_hora.astimezone(self._fuso).date()
        self._titulo = f"Ficha de Atendimento Nº {self._numero}"
        quando = f.data_hora(data_hora, self._fuso)
        self._secoes.append(
            self._macros.cabecalho(numero=self._numero, data_hora=quando.replace(" ", " às ") if quando else None)
        )
        return self

    def paciente(self, pessoa: dict[str, Any]) -> Self:
        nascimento = f.data_iso(pessoa.get("dataNascimento"))
        idade = f.idade(nascimento, self._referencia)
        if nascimento is None:
            texto_nascimento = None
        elif idade is None:
            texto_nascimento = f.data(nascimento)
        else:
            texto_nascimento = f"{f.data(nascimento)} ({idade} {'ano' if idade == 1 else 'anos'})"
        self._titulo = f"{self._titulo} — {pessoa.get('nome', '')}"
        campos = [
            Campo("Nome", pessoa.get("nome"), colunas=3, destaque=True),
            Campo("CPF", f.cpf(pessoa.get("cpf"))),
            Campo("Data de nascimento", texto_nascimento),
            Campo("Sexo", f.rotulo(f.SEXO, pessoa.get("sexo"))),
            Campo("Telefone", f.telefone(pessoa.get("telefone"))),
            Campo("E-mail", pessoa.get("email"), colunas=2),
            Campo("Contato do familiar", _contato(pessoa.get("contato") or {}), colunas=3),
        ]
        self._secoes.append(self._macros.secao_campos(titulo="Paciente", campos=campos))
        return self

    def prontuario(self, prontuario: dict[str, Any] | None) -> Self:
        prontuario = prontuario or {}
        alergias = prontuario.get("alergias")
        campos = [
            Campo("Tipo sanguíneo", f.tipo_sanguineo(prontuario.get("tipoSanguineo"))),
            # Alergia é o que mais importa para quem continua o atendimento: fica em destaque
            Campo("Alergias", alergias, colunas=2, destaque=bool(alergias)),
            Campo("Comorbidades", prontuario.get("comorbidades")),
            Campo("Medicamentos de uso contínuo", prontuario.get("medicamentosUsoContinuo"), colunas=2),
        ]
        if prontuario.get("observacoes"):
            campos.append(Campo("Observações do prontuário", prontuario["observacoes"], colunas=3))
        self._secoes.append(self._macros.secao_campos(titulo="Prontuário", campos=campos))
        return self

    def ocorrencia(self, tipo: str | None, local: str | None, queixa: str | None) -> Self:
        campos = [
            Campo("Tipo de ocorrência", f.rotulo(f.TIPO_OCORRENCIA, tipo)),
            Campo("Local", local, colunas=2),
            Campo("Queixa principal", queixa, colunas=3, destaque=True),
        ]
        self._secoes.append(self._macros.secao_campos(titulo="Ocorrência", campos=campos))
        return self

    def triagem(self, protocolo: str | None, cor: str | None) -> Self:
        significados = f.SIGNIFICADO_START if protocolo == "START" else f.SIGNIFICADO_MANCHESTER
        fundo, texto = f.COR_HEX.get(cor or "", ("#6b7280", "#ffffff"))
        self._secoes.append(
            self._macros.triagem(
                protocolo=f.rotulo(f.PROTOCOLO, protocolo),
                cor=f.rotulo(f.COR, cor),
                significado=significados.get(cor or ""),
                fundo=fundo,
                texto=texto,
            )
        )
        return self

    def avaliacao(self, glasgow: dict[str, Any] | None, sinais: dict[str, Any] | None) -> Self:
        escala = None
        if glasgow:
            total = int(glasgow.get("total") or (glasgow["ocular"] + glasgow["verbal"] + glasgow["motora"]))
            escala = {
                "itens": [
                    ("Abertura ocular", glasgow["ocular"], f.GLASGOW_OCULAR.get(glasgow["ocular"], "")),
                    ("Resposta verbal", glasgow["verbal"], f.GLASGOW_VERBAL.get(glasgow["verbal"], "")),
                    ("Resposta motora", glasgow["motora"], f.GLASGOW_MOTORA.get(glasgow["motora"], "")),
                ],
                "total": total,
                "gravidade": f.gravidade_glasgow(total),
            }
        sinais = sinais or {}
        sistolica, diastolica = sinais.get("paSistolica"), sinais.get("paDiastolica")
        if sistolica is None and diastolica is None:
            pressao = None
        else:
            pressao = f"{f.numero(sistolica) or '—'} × {f.numero(diastolica) or '—'} mmHg"

        def com_unidade(valor: Any, unidade: str) -> str | None:
            return f"{f.numero(valor)} {unidade}" if valor is not None else None

        vitais = [
            ("Pressão arterial", pressao),
            ("Frequência cardíaca", com_unidade(sinais.get("frequenciaCardiaca"), "bpm")),
            ("Frequência respiratória", com_unidade(sinais.get("frequenciaRespiratoria"), "irpm")),
            ("Saturação de O₂ (SpO₂)", com_unidade(sinais.get("spo2"), "%")),
            ("Temperatura", com_unidade(sinais.get("temperatura"), "°C")),
            ("Glicemia capilar", com_unidade(sinais.get("glicemia"), "mg/dL")),
        ]
        self._secoes.append(self._macros.avaliacao(glasgow=escala, vitais=vitais))
        return self

    def medicamentos(self, itens: list[dict[str, Any]]) -> Self:
        linhas = [
            {
                "nome": item.get("nome") or "(medicamento sem nome)",
                "dose": f"{f.numero(item.get('dose'))} {f.rotulo(f.UNIDADE, item.get('unidade')) or ''}".strip(),
                "via": f.rotulo(f.VIA, item.get("via")),
                "horario": f.hora(f.instante(item.get("horario")), self._fuso, self._referencia),
                "observacao": item.get("observacao"),
            }
            for item in sorted(itens, key=lambda i: i.get("horario") or "")
        ]
        self._secoes.append(self._macros.medicamentos(itens=linhas))
        return self

    def desfecho(self, desfecho: dict[str, Any] | None, procedimentos: str | None, observacoes: str | None) -> Self:
        desfecho = desfecho or {}
        campos = [Campo("Desfecho", f.rotulo(f.DESFECHO, desfecho.get("tipo")), destaque=True)]
        # Destino só existe quando o paciente foi levado a um hospital; observações, só se houver
        if desfecho.get("destino"):
            campos.append(Campo("Destino", desfecho["destino"], colunas=2))
        campos.append(Campo("Procedimentos realizados", procedimentos, colunas=3))
        if observacoes:
            campos.append(Campo("Observações", observacoes, colunas=3))
        self._secoes.append(self._macros.secao_campos(titulo="Procedimentos e desfecho", campos=campos))
        return self

    def rodape(self, atendimento_id: str, origem: dict[str, Any] | None, sincronizacao: dict[str, Any] | None) -> Self:
        origem = origem or {}
        sincronizacao = sincronizacao or {}
        responsavel = origem.get("criadoPorNome")
        if responsavel and origem.get("criadoPorRegistro"):
            responsavel = f"{responsavel} ({origem['criadoPorRegistro']})"
        campos = [
            Campo("Profissional responsável", responsavel, colunas=2, destaque=True),
            Campo("Modo de registro", f.rotulo(f.MODO, origem.get("modo"))),
            Campo("Dispositivo", origem.get("dispositivoNome")),
            Campo("Registrado no dispositivo em", f.data_hora(f.instante(origem.get("criadoEm")), self._fuso)),
            Campo("Recebido pelo servidor em", f.data_hora(f.instante(sincronizacao.get("recebidoEm")), self._fuso)),
            Campo("Documento gerado em", f.data_hora(self._gerado_em, self._fuso)),
            Campo("ID do atendimento", atendimento_id, colunas=2),
        ]
        # O aviso de LGPD vai no rodapé de todas as páginas (ficha.css, @page)
        self._secoes.append(self._macros.rodape(campos=campos))
        return self

    def construir(self) -> bytes:
        html = self._macros.documento(titulo=self._titulo, secoes=self._secoes)
        # Uma geração por vez: o Pango/fontconfig por baixo do WeasyPrint não garante uso em várias threads
        with _uma_geracao_por_vez:
            return HTML(string=str(html)).write_pdf(stylesheets=[_estilo])


@dataclass(frozen=True)
class FichaGerada:
    pdf: bytes
    nome_do_arquivo: str


class MontadorDaFicha:
    """O "diretor" do Builder: a ordem das seções é a da seção 9.5 de docs/09-ficha-e-dominio.md."""

    def __init__(self, fuso: ZoneInfo):
        self._fuso = fuso

    def montar(self, atendimento: dict[str, Any], gerado_em: datetime) -> FichaGerada:
        atendimento_id = str(atendimento["id"])
        triagem = atendimento.get("triagem") or {}
        pdf = (
            FichaPdfBuilder(self._fuso, gerado_em)
            .cabecalho(atendimento_id, f.instante(atendimento.get("dataHora")))
            .paciente(atendimento.get("pessoa") or {})
            .prontuario(atendimento.get("prontuario"))
            .ocorrencia(
                atendimento.get("tipoOcorrencia"),
                atendimento.get("localOcorrencia"),
                atendimento.get("queixaPrincipal"),
            )
            .triagem(triagem.get("protocolo"), triagem.get("cor"))
            .avaliacao(atendimento.get("glasgow"), atendimento.get("sinaisVitais"))
            .medicamentos(atendimento.get("medicamentos") or [])
            .desfecho(atendimento.get("desfecho"), atendimento.get("procedimentos"), atendimento.get("observacoes"))
            .rodape(atendimento_id, atendimento.get("origem"), atendimento.get("sincronizacao"))
            .construir()
        )
        return FichaGerada(pdf=pdf, nome_do_arquivo=nome_do_arquivo(atendimento_id))


def _contato(contato: dict[str, Any]) -> str | None:
    """Numa linha só: "Maria da Silva (Esposa) · (51) 98888-0000 · maria@exemplo.com"."""
    nome = contato.get("nome")
    if nome and contato.get("parentesco"):
        nome = f"{nome} ({contato['parentesco']})"
    partes = [nome, f.telefone(contato.get("telefone")), contato.get("email")]
    return " · ".join(p for p in partes if p) or None


def nome_do_arquivo(atendimento_id: str) -> str:
    return f"ficha-atendimento-{f.numero_da_ficha(atendimento_id)}.pdf"
