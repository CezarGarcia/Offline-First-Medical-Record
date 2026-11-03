package br.univates.medicalfield.clinico;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** "Receber dados" (GET /api/sync/pull): docs/07-sincronizacao.md, seção 7.7. */
class SincronizacaoTest extends TesteIntegracao {

    private static List<String> ids(JsonNode lista) {
        List<String> ids = new ArrayList<>();
        lista.forEach(item -> ids.add(item.path("id").asString()));
        return ids;
    }

    private Resposta pull(String cursor, String token) {
        return get("/api/sync/pull" + (cursor == null ? "" : "?desde=" + URLEncoder.encode(cursor, StandardCharsets.UTF_8)), token);
    }

    @Test
    void semCursorTrazTudoEDevolveUmCursor() {
        String token = tokenOperacional();
        UUID pessoa = criarPessoa(token, cpfAleatorio());

        Resposta r = pull(null, token);

        assertThat(r.status()).isEqualTo(200);
        assertThat(Instant.parse(r.corpo().path("cursor").asString())).isBeforeOrEqualTo(Instant.now());
        assertThat(ids(r.corpo().path("pessoas"))).contains(pessoa.toString());
        assertThat(r.corpo().has("medicamentos") && r.corpo().has("prontuarios") && r.corpo().has("atendimentos")
                && r.corpo().has("unificacoes")).isTrue();
    }

    @Test
    void comCursorTrazSoOQueMudouIncluindoInsertsEUpdatesFeitosNoSql() {
        String token = tokenOperacional();
        UUID antiga = criarPessoa(token, cpfAleatorio());
        // Simula um registro que mudou há uma hora (bem antes do cursor, fora da margem de 30 s)
        jdbc.sql("UPDATE clinico.pessoa SET atualizado_em = now() - interval '1 hour' WHERE id = :id").param("id", antiga).update();
        UUID medicamentoParaDesativar = criarMedicamento("Desativar");
        jdbc.sql("UPDATE clinico.medicamento SET atualizado_em = now() - interval '1 hour' WHERE id = :id")
                .param("id", medicamentoParaDesativar).update();

        String cursor = pull(null, token).corpo().path("cursor").asString();

        UUID nova = criarPessoa(token, cpfAleatorio());
        UUID medicamentoNovo = criarMedicamento("Passo 9 do roteiro");
        jdbc.sql("UPDATE clinico.medicamento SET ativo = false WHERE id = :id").param("id", medicamentoParaDesativar).update();

        Resposta r = pull(cursor, token);

        assertThat(ids(r.corpo().path("pessoas"))).contains(nova.toString()).doesNotContain(antiga.toString());
        assertThat(ids(r.corpo().path("medicamentos"))).contains(medicamentoNovo.toString(), medicamentoParaDesativar.toString());
    }

    @Test
    void unificacaoApareceComOApelidoEComAPessoaMantidaAtualizada() {
        String token = tokenOperacional();
        String cpf = cpfAleatorio();
        UUID mantida = criarPessoa(token, cpf);
        jdbc.sql("UPDATE clinico.pessoa SET atualizado_em = now() - interval '1 hour' WHERE id = :id").param("id", mantida).update();
        String cursor = pull(null, token).corpo().path("cursor").asString();

        UUID descartada = UUID.randomUUID();
        post("/api/pessoa", objeto().put("id", descartada.toString()).put("nome", "Paciente de Teste").put("cpf", cpf)
                .put("telefone", "51900000000"), token);

        Resposta r = pull(cursor, token);

        assertThat(ids(r.corpo().path("pessoas"))).contains(mantida.toString()).doesNotContain(descartada.toString());
        boolean temApelido = false;
        for (JsonNode u : r.corpo().path("unificacoes")) {
            temApelido |= u.path("idDescartado").asString().equals(descartada.toString())
                    && u.path("idMantido").asString().equals(mantida.toString())
                    && u.path("entidade").asString().equals("PESSOA");
        }
        assertThat(temApelido).isTrue();
    }

    @Test
    void cursorInvalido() {
        Resposta r = get("/api/sync/pull?desde=ontem", tokenOperacional());
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.camposComErro()).containsExactly("desde");
    }
}
