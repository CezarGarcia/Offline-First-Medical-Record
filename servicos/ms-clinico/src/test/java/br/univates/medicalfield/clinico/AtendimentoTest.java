package br.univates.medicalfield.clinico;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class AtendimentoTest extends TesteIntegracao {

    private ObjectNode ficha(UUID prontuario, UUID... medicamentos) {
        Instant quando = Instant.now().minus(30, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        ObjectNode ficha = objeto()
                .put("id", UUID.randomUUID().toString())
                .put("prontuarioId", prontuario.toString())
                .put("dataHora", quando.toString())
                .put("localOcorrencia", "BR-386, km 350")
                .put("tipoOcorrencia", "TRAUMA")
                .put("queixaPrincipal", "Dor torácica após colisão")
                .put("procedimentos", "Imobilização cervical");
        ficha.putObject("triagem").put("protocolo", "MANCHESTER").put("cor", "LARANJA");
        ficha.putObject("glasgow").put("ocular", 4).put("verbal", 5).put("motora", 6);
        ficha.putObject("sinaisVitais").put("paSistolica", 130).put("paDiastolica", 85).put("frequenciaCardiaca", 98)
                .put("spo2", 96).put("temperatura", 36.8);
        ficha.putObject("desfecho").put("tipo", "ENCAMINHADO_HOSPITAL").put("destino", "Hospital Regional");
        ArrayNode itens = ficha.putArray("medicamentos");
        for (UUID medicamento : medicamentos) {
            itens.addObject().put("id", UUID.randomUUID().toString()).put("medicamentoId", medicamento.toString())
                    .put("dose", 1.5).put("unidade", "G").put("via", "INTRAVENOSA")
                    .put("horario", quando.plus(5, ChronoUnit.MINUTES).toString());
        }
        return ficha;
    }

    @Test
    void cadastraAFichaCompletaComMedicamentosEConsulta() {
        String token = tokenOperacional();
        UUID pessoa = criarPessoa(token, cpfAleatorio());
        UUID prontuario = criarProntuario(token, pessoa);
        UUID dipirona = criarMedicamento("Dipirona");
        UUID ondansetrona = criarMedicamento("Ondansetrona");
        ObjectNode corpo = ficha(prontuario, dipirona, ondansetrona);

        Resposta r = post("/api/atendimento", corpo, token);

        assertThat(r.status()).isEqualTo(201);
        JsonNode dados = r.corpo().path("dados");
        assertThat(dados.path("glasgow").path("total").asInt()).isEqualTo(15);
        assertThat(dados.path("sinaisVitais").path("temperatura").asDouble()).isEqualTo(36.8);
        assertThat(dados.path("medicamentos")).hasSize(2);
        assertThat(dados.path("medicamentos").get(0).path("nome").asString()).startsWith("TESTE ");
        assertThat(dados.path("medicamentos").get(0).path("dose").asDouble()).isEqualTo(1.5);
        assertThat(dados.path("desfecho").path("destino").asString()).isEqualTo("Hospital Regional");

        Resposta reenvio = post("/api/atendimento", corpo, token);
        assertThat(reenvio.corpo().path("resultado").asString()).isEqualTo("JA_EXISTIA");
        assertThat(reenvio.corpo().path("dados").path("medicamentos")).hasSize(2);

        String id = r.corpo().path("id").asString();
        Resposta detalhe = get("/api/atendimento/detalhe/" + id, token);
        assertThat(detalhe.status()).isEqualTo(200);
        assertThat(detalhe.corpo().path("pessoa").path("id").asString()).isEqualTo(pessoa.toString());
        assertThat(detalhe.corpo().path("prontuario").path("id").asString()).isEqualTo(prontuario.toString());

        JsonNode daPessoa = get("/api/atendimento/" + pessoa, token).corpo();
        assertThat(daPessoa).hasSize(1);
        assertThat(daPessoa.get(0).path("id").asString()).isEqualTo(id);

        boolean noResumo = false;
        for (JsonNode a : get("/api/atendimento", token).corpo()) {
            if (a.path("id").asString().equals(id)) {
                noResumo = a.path("pessoa").path("id").asString().equals(pessoa.toString())
                        && a.path("triagem").path("cor").asString().equals("LARANJA");
            }
        }
        assertThat(noResumo).isTrue();
    }

    @Test
    void referenciasInexistentes() {
        String token = tokenOperacional();
        Resposta semProntuario = post("/api/atendimento", ficha(UUID.randomUUID()), token);
        assertThat(semProntuario.status()).isEqualTo(422);
        assertThat(semProntuario.erro()).isEqualTo("PRONTUARIO_NAO_ENCONTRADO");

        UUID prontuario = criarProntuario(token, criarPessoa(token, cpfAleatorio()));
        Resposta semMedicamento = post("/api/atendimento", ficha(prontuario, UUID.randomUUID()), token);
        assertThat(semMedicamento.status()).isEqualTo(422);
        assertThat(semMedicamento.erro()).isEqualTo("MEDICAMENTO_NAO_ENCONTRADO");

        assertThat(get("/api/atendimento/detalhe/" + UUID.randomUUID(), token).status()).isEqualTo(404);
        assertThat(get("/api/atendimento/" + UUID.randomUUID(), token).status()).isEqualTo(404);
    }

    @Test
    void regrasEntreCamposDaFicha() {
        String token = tokenOperacional();
        UUID prontuario = criarProntuario(token, criarPessoa(token, cpfAleatorio()));
        UUID medicamento = criarMedicamento("Morfina");

        ObjectNode corInvalida = ficha(prontuario);
        ((ObjectNode) corInvalida.get("triagem")).put("protocolo", "START").put("cor", "LARANJA");
        assertThat(post("/api/atendimento", corInvalida, token).camposComErro()).containsExactly("triagem.cor");

        ObjectNode semDestino = ficha(prontuario);
        ((ObjectNode) semDestino.get("desfecho")).remove("destino");
        assertThat(post("/api/atendimento", semDestino, token).camposComErro()).containsExactly("desfecho.destino");

        ObjectNode glasgowIncompleto = ficha(prontuario);
        ((ObjectNode) glasgowIncompleto.get("glasgow")).remove("motora");
        assertThat(post("/api/atendimento", glasgowIncompleto, token).camposComErro()).containsExactly("glasgow.motora");

        ObjectNode noFuturo = ficha(prontuario);
        noFuturo.put("dataHora", Instant.now().plus(3, ChronoUnit.HOURS).toString());
        assertThat(post("/api/atendimento", noFuturo, token).camposComErro()).containsExactly("dataHora");

        ObjectNode valoresForaDaFaixa = ficha(prontuario, medicamento);
        ((ObjectNode) valoresForaDaFaixa.get("sinaisVitais")).put("temperatura", 50).put("spo2", 120);
        ((ObjectNode) valoresForaDaFaixa.get("medicamentos").get(0)).put("dose", 0).put("unidade", "BALDE");
        assertThat(post("/api/atendimento", valoresForaDaFaixa, token).camposComErro()).containsExactlyInAnyOrder(
                "sinaisVitais.temperatura", "sinaisVitais.spo2", "medicamentos.0.dose", "medicamentos.0.unidade");

        ObjectNode itemRepetido = ficha(prontuario, medicamento, medicamento);
        String idDoItem = itemRepetido.get("medicamentos").get(0).path("id").asString();
        ((ObjectNode) itemRepetido.get("medicamentos").get(1)).put("id", idDoItem);
        assertThat(post("/api/atendimento", itemRepetido, token).camposComErro()).containsExactly("medicamentos.1.id");

        ObjectNode semObrigatorios = objeto().put("prontuarioId", prontuario.toString());
        assertThat(post("/api/atendimento", semObrigatorios, token).camposComErro()).contains(
                "dataHora", "tipoOcorrencia", "queixaPrincipal", "triagem", "desfecho");
    }

    @Test
    void atendimentoComProntuarioDescartadoVaiParaOProntuarioMantido() {
        String token = tokenOperacional();
        UUID pessoa = criarPessoa(token, cpfAleatorio());
        UUID mantido = criarProntuario(token, pessoa);
        UUID descartado = UUID.randomUUID();
        assertThat(post("/api/prontuario", objeto().put("id", descartado.toString()).put("pessoaId", pessoa.toString()),
                token).corpo().path("resultado").asString()).isEqualTo("UNIFICADO");

        Resposta r = post("/api/atendimento", ficha(descartado), token);

        assertThat(r.status()).isEqualTo(201);
        assertThat(r.corpo().path("dados").path("prontuarioId").asString()).isEqualTo(mantido.toString());
    }
}
