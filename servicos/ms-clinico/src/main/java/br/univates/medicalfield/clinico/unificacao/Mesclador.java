package br.univates.medicalfield.clinico.unificacao;

import br.univates.medicalfield.clinico.comum.Valores;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Junta um registro duplicado no que já estava no servidor, campo a campo:
 * <ul>
 *   <li>só o recebido preencheu: o valor dele é aproveitado (COMPLEMENTO);</li>
 *   <li>os dois preencheram com valores diferentes: a {@link EstrategiaDeMesclagem} decide (CONFLITO);</li>
 *   <li>só o existente preencheu, ou os valores são iguais: nada muda.</li>
 * </ul>
 * Cada campo guarda o próprio carimbo (data/hora de origem do valor), para a regra "mais recente
 * vence" continuar certa mesmo depois de várias unificações.
 */
public class Mesclador {

    private final EstrategiaDeMesclagem estrategia;

    public Mesclador(EstrategiaDeMesclagem estrategia) {
        this.estrategia = estrategia;
    }

    public EstrategiaDeMesclagem estrategia() {
        return estrategia;
    }

    /**
     * @param campos campos mescláveis, com o nome usado na API (para o registro do conflito)
     * @param existente valores atuais no servidor (chave = coluna)
     * @param carimbosDoExistente carimbo de cada campo do existente
     * @param carimboPadraoDoExistente usado quando um campo não tem carimbo próprio
     * @param recebido valores do duplicado que chegou
     * @param carimboDoRecebido quando o profissional registrou o duplicado
     */
    public Mesclagem mesclar(
            Map<String, String> campos,
            Map<String, String> existente,
            Map<String, Instant> carimbosDoExistente,
            Instant carimboPadraoDoExistente,
            Map<String, String> recebido,
            Instant carimboDoRecebido) {

        Map<String, String> valores = new LinkedHashMap<>(existente);
        Map<String, Instant> carimbos = new LinkedHashMap<>(carimbosDoExistente);
        List<Diferenca> diferencas = new ArrayList<>();

        campos.forEach((coluna, nomeNaApi) -> {
            String atual = existente.get(coluna);
            String novo = recebido.get(coluna);
            if (vazio(novo) || Objects.equals(atual, novo)) {
                return;
            }
            if (vazio(atual)) {
                valores.put(coluna, novo);
                carimbos.put(coluna, carimboDoRecebido);
                diferencas.add(new Diferenca(nomeNaApi, "COMPLEMENTO", novo, atual, "RECEBIDO"));
                return;
            }
            Instant carimboAtual = carimbos.getOrDefault(coluna, carimboPadraoDoExistente);
            if (estrategia.decidir(carimboAtual, carimboDoRecebido) == EstrategiaDeMesclagem.Vencedor.RECEBIDO) {
                valores.put(coluna, novo);
                carimbos.put(coluna, carimboDoRecebido);
                diferencas.add(new Diferenca(nomeNaApi, "CONFLITO", novo, atual, "RECEBIDO"));
            } else {
                diferencas.add(new Diferenca(nomeNaApi, "CONFLITO", atual, novo, "EXISTENTE"));
            }
        });
        return new Mesclagem(valores, carimbos, diferencas);
    }

    /** Vazio, só espaços, DESCONHECIDO (tipo sanguíneo) e NAO_INFORMADO (sexo) contam como não preenchido. */
    static boolean vazio(String valor) {
        return valor == null || valor.isBlank() || Valores.EQUIVALENTES_A_VAZIO.contains(valor);
    }

    public record Mesclagem(Map<String, String> valores, Map<String, Instant> carimbos, List<Diferenca> diferencas) {
    }
}
