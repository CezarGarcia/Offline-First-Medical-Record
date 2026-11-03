package br.univates.medicalfield.clinico.comum;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Listas fixas de valores (as mesmas dos CHECK do banco e de docs/05-modelo-de-dados.md). */
public final class Valores {

    private Valores() {
    }

    private static final String USE = "valor não permitido (use: ";

    public static final String SEXO = "MASCULINO|FEMININO|OUTRO|NAO_INFORMADO";
    public static final String MSG_SEXO = USE + "MASCULINO, FEMININO, OUTRO, NAO_INFORMADO)";

    public static final String TIPO_SANGUINEO = "A\\+|A-|B\\+|B-|AB\\+|AB-|O\\+|O-|DESCONHECIDO";
    public static final String MSG_TIPO_SANGUINEO = USE + "A+, A-, B+, B-, AB+, AB-, O+, O-, DESCONHECIDO)";

    public static final String TIPO_OCORRENCIA = "CLINICA|TRAUMA|OBSTETRICA|PSIQUIATRICA|OUTRO";
    public static final String MSG_TIPO_OCORRENCIA = USE + "CLINICA, TRAUMA, OBSTETRICA, PSIQUIATRICA, OUTRO)";

    public static final String PROTOCOLO = "MANCHESTER|START";
    public static final String MSG_PROTOCOLO = USE + "MANCHESTER, START)";

    public static final String COR = "VERMELHO|LARANJA|AMARELO|VERDE|AZUL|PRETO";
    public static final String MSG_COR = USE + "VERMELHO, LARANJA, AMARELO, VERDE, AZUL, PRETO)";

    public static final String DESFECHO = "ENCAMINHADO_HOSPITAL|LIBERADO_NO_LOCAL|RECUSOU_ATENDIMENTO|OBITO";
    public static final String MSG_DESFECHO = USE + "ENCAMINHADO_HOSPITAL, LIBERADO_NO_LOCAL, RECUSOU_ATENDIMENTO, OBITO)";

    public static final String UNIDADE = "MG|MCG|G|ML|UI|GOTA|COMPRIMIDO|AMPOLA|OUTRA";
    public static final String MSG_UNIDADE = USE + "MG, MCG, G, ML, UI, GOTA, COMPRIMIDO, AMPOLA, OUTRA)";

    public static final String VIA =
            "INTRAVENOSA|INTRAMUSCULAR|SUBCUTANEA|ORAL|SUBLINGUAL|INALATORIA|INTRAOSSEA|TOPICA|OUTRA";
    public static final String MSG_VIA = USE
            + "INTRAVENOSA, INTRAMUSCULAR, SUBCUTANEA, ORAL, SUBLINGUAL, INALATORIA, INTRAOSSEA, TOPICA, OUTRA)";

    public static final String MODO = "ONLINE|OFFLINE";
    public static final String MSG_MODO = USE + "ONLINE, OFFLINE)";

    /** As cores dependem do protocolo de triagem. */
    public static final Map<String, List<String>> CORES_POR_PROTOCOLO = Map.of(
            "MANCHESTER", List.of("VERMELHO", "LARANJA", "AMARELO", "VERDE", "AZUL"),
            "START", List.of("VERMELHO", "AMARELO", "VERDE", "PRETO"));

    /** Valores que contam como "não preenchido" numa unificação. */
    public static final Set<String> EQUIVALENTES_A_VAZIO = Set.of("DESCONHECIDO", "NAO_INFORMADO");

    /** Folga para relógios de aparelho um pouco adiantados. */
    public static final Duration TOLERANCIA_FUTURO = Duration.ofHours(1);

    /** Margem do "receber dados": cobre gravações que estavam em andamento na consulta anterior. */
    public static final Duration MARGEM_PULL = Duration.ofSeconds(30);
}
